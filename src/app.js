import { existsSync } from "node:fs";
import path from "node:path";
import express from "express";
import {
  ADMIN_DIST,
  CRON_SECRET,
  DEFAULT_CHANNEL,
  GITHUB_TOKEN,
  MAX_BODY,
  PUBLIC_BASE_URL,
  SERVICE_NAME,
  SESSION_SECRET,
} from "./config.js";
import {
  createCaptcha,
  hashPassword,
  randomHex,
  signToken,
  verifyCaptcha,
  verifyPassword,
} from "./crypto.js";
import {
  clientIp,
  clearFailures,
  lockRemaining,
  recordFailure,
  requireAuth,
} from "./auth.js";
import {
  audit,
  nextId,
  readState,
  recordStat,
  statSeries,
  updateState,
} from "./store.js";
import {
  buildPublicUpdate,
  isValidVersion,
  mapGithubRelease,
  normalizeVersion,
  publicMirrors,
  safePattern,
  toLegacyUpdate,
} from "./release.js";
import {
  getLatestRelease,
  getReleaseByTag,
  isValidRepo,
  listReleases,
} from "./github.js";

export const app = express();
app.disable("x-powered-by");
app.set("trust proxy", true);
app.use(express.json({ limit: MAX_BODY }));

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
  );
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Cron-Secret");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const httpError = (status, message) => Object.assign(new Error(message), { status });

const text = (value, max = 4000) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

const rawText = (value, max = 20000) =>
  typeof value === "string" ? value.slice(0, max) : "";

const bool = (value) => value === true || value === 1 || value === "1" || value === "true";

const number = (value, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(Math.max(parsed, min), max);
};

const isHttpUrl = (value) => /^https?:\/\/[^\s]+$/i.test(String(value));

const cloneRelease = (release) => ({ ...release });

function cleanRelease(body, previous) {
  const source = body?.source;
  const version = normalizeVersion(body?.version ?? previous.version);
  if (!isValidVersion(version)) throw httpError(400, "版本号格式不正确，例如 0.2.1");

  const downloadUrl = body?.downloadUrl === undefined ? previous.downloadUrl : text(body.downloadUrl, 800);
  if (downloadUrl && !isHttpUrl(downloadUrl)) throw httpError(400, "下载地址必须是 http(s) 链接");

  const releaseUrl = body?.releaseUrl === undefined ? previous.releaseUrl || "" : text(body.releaseUrl, 800);
  if (releaseUrl && !isHttpUrl(releaseUrl)) throw httpError(400, "发布页地址必须是 http(s) 链接");

  const sha256 = String(body?.sha256 ?? previous.sha256 ?? "")
    .trim()
    .toLowerCase();
  if (sha256 && !/^[a-f0-9]{64}$/.test(sha256)) throw httpError(400, "SHA256 必须是 64 位十六进制");

  const minSupported = normalizeVersion(body?.minSupported ?? previous.minSupported ?? "0.0.0");
  if (minSupported && minSupported !== "0.0.0" && !isValidVersion(minSupported)) {
    throw httpError(400, "最低支持版本格式不正确");
  }

  const packageType = body?.packageType === "installer" ? "installer" : "portable";
  const mirrors = Array.isArray(body?.mirrors)
    ? body.mirrors
        .filter((item) => item && isHttpUrl(item.url))
        .slice(0, 8)
        .map((item) => ({ name: text(item.name, 80) || "下载节点", url: text(item.url, 800) }))
    : previous.mirrors || [];

  const now = Date.now();
  return {
    version,
    title: text(body?.title, 140) || previous.title || `Turf Launcher ${version}`,
    notes: body?.notes === undefined ? previous.notes : rawText(body.notes, 30000),
    force: body?.force === undefined ? Boolean(previous.force) : bool(body.force),
    channel: text(body?.channel, 20) || previous.channel || DEFAULT_CHANNEL,
    packageType,
    downloadUrl,
    sha256,
    size: Math.round(number(body?.size ?? previous.size ?? 0, 0, 4 * 1024 * 1024 * 1024)),
    releaseUrl,
    minSupported: minSupported || "0.0.0",
    publishedAt: Number(body?.publishedAt) > 0 ? Number(body.publishedAt) : Number(previous.publishedAt) || now,
    updatedAt: now,
    source: source === "github" || source === "manual" ? source : previous.source || "manual",
    mirrors,
  };
}

function cleanAnnouncement(body, previous = null) {
  const title = text(body?.title, 140) || previous?.title || "";
  if (!title) throw httpError(400, "请填写公告标题");
  const level = ["info", "warning", "important"].includes(body?.level)
    ? body.level
    : previous?.level || "info";
  const expiresAt = Number(body?.expiresAt) > 0 ? Number(body.expiresAt) : 0;
  return {
    title,
    content: body?.content === undefined ? previous?.content || "" : rawText(body.content, 20000),
    pinned: body?.pinned === undefined ? Boolean(previous?.pinned) : bool(body.pinned),
    level,
    enabled: body?.enabled === undefined ? previous?.enabled !== false : bool(body.enabled),
    expiresAt,
  };
}

function cleanMirror(body, previous = null) {
  const name = text(body?.name, 80) || previous?.name || "";
  if (!name) throw httpError(400, "请填写镜像名称");
  const url = body?.url === undefined ? previous?.url || "" : text(body.url, 800);
  if (!isHttpUrl(url)) throw httpError(400, "镜像地址必须是 http(s) 链接");
  const scope = body?.scope === "game" ? "game" : body?.scope === "update" ? "update" : previous?.scope || "update";
  const region = ["global", "cn", "auto"].includes(body?.region)
    ? body.region
    : previous?.region || "auto";
  return {
    name,
    url,
    scope,
    region,
    enabled: body?.enabled === undefined ? previous?.enabled !== false : bool(body.enabled),
    sortOrder: Math.round(number(body?.sortOrder ?? previous?.sortOrder ?? 0, -999, 999)),
  };
}

function publicAnnouncement(item) {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    pinned: Boolean(item.pinned),
    level: item.level || "info",
    createdAt: item.createdAt || 0,
    expiresAt: item.expiresAt || 0,
  };
}

function publicMirror(item) {
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    scope: item.scope || "update",
    region: item.region || "auto",
    sortOrder: item.sortOrder || 0,
  };
}

function settingsView(state) {
  const github = state.settings.github || {};
  return {
    siteName: state.settings.siteName,
    channel: state.settings.channel,
    apiBase: state.settings.apiBase || PUBLIC_BASE_URL,
    github: {
      repo: github.repo || "",
      hasToken: Boolean(github.token),
      assetPattern: github.assetPattern || "",
      autoSync: Boolean(github.autoSync),
    },
    cronSecret: state.settings.cronSecret || "",
  };
}

function overviewView(state) {
  return {
    stats: {
      updateChecks: state.stats.updateChecks || 0,
      launches: state.stats.launches || 0,
      lastUpdateCheckAt: state.stats.lastUpdateCheckAt || 0,
      lastLaunchAt: state.stats.lastLaunchAt || 0,
      series: statSeries(state, 14),
    },
    counts: {
      announcements: state.announcements.length,
      mirrors: state.mirrors.length,
      audits: state.audit.length,
    },
    release: cloneRelease(state.release),
    github: {
      repo: state.settings.github.repo || "",
      autoSync: Boolean(state.settings.github.autoSync),
      lastAt: state.sync.lastAt || 0,
      lastTag: state.sync.lastTag || "",
      lastVersion: state.sync.lastVersion || "",
      lastError: state.sync.lastError || "",
      hasToken: Boolean(state.settings.github.token || GITHUB_TOKEN),
    },
    settings: {
      siteName: state.settings.siteName,
      channel: state.settings.channel,
      apiBase: state.settings.apiBase || PUBLIC_BASE_URL,
    },
    serverTime: Date.now(),
  };
}

function githubTokenOf(state) {
  return state.settings.github.token || GITHUB_TOKEN || "";
}

let autoSyncRunning = false;
let autoSyncAt = 0;

function maybeAutoSync(state) {
  const github = state.settings.github;
  if (!github.autoSync || !github.repo) return;
  if (state.release.source !== "github") return;
  if (autoSyncRunning || Date.now() - autoSyncAt < 5 * 60 * 1000) return;

  autoSyncAt = Date.now();
  autoSyncRunning = true;
  void (async () => {
    try {
      const release = await getLatestRelease(github.repo, githubTokenOf(state));
      if (!release) return;
      const mapped = mapGithubRelease(release, {
        pattern: github.assetPattern,
        previous: state.release,
      });
      if (!mapped.version || mapped.version === state.release.version) return;
      await updateState((draft) => {
        draft.release = { ...mapped, force: draft.release.force, minSupported: draft.release.minSupported };
        draft.sync = {
          lastAt: Date.now(),
          lastTag: release.tag_name || "",
          lastVersion: mapped.version,
          lastError: "",
        };
        audit(draft, "release.auto-sync", `${release.tag_name || ""} → ${mapped.version}`);
      });
    } catch (error) {
      await updateState((draft) => {
        draft.sync.lastError = String(error?.message || error).slice(0, 300);
      }).catch(() => undefined);
    } finally {
      autoSyncRunning = false;
    }
  })();
}

/* ============================ 认证 ============================ */

app.get(
  "/api/auth/captcha",
  asyncRoute(async (_req, res) => {
    const state = await readState();
    const secret = SESSION_SECRET || state.security.secret;
    if (!secret) throw httpError(503, "服务尚未初始化，请稍后重试");
    res.setHeader("Cache-Control", "no-store");
    res.json(createCaptcha(secret));
  })
);

app.post(
  "/api/auth/login",
  asyncRoute(async (req, res) => {
    const ip = clientIp(req);
    const locked = lockRemaining(ip);
    if (locked > 0) {
      res.status(429).json({ error: `尝试次数过多，请 ${locked} 秒后再试` });
      return;
    }

    const username = text(req.body?.username, 80);
    const password = typeof req.body?.password === "string" ? req.body.password.slice(0, 200) : "";
    const captchaId = typeof req.body?.captchaId === "string" ? req.body.captchaId.slice(0, 600) : "";
    const captchaAnswer = text(req.body?.captchaAnswer, 20);

    if (!username || !password) throw httpError(400, "请输入账号和密码");

    const state = await readState();
    const secret = SESSION_SECRET || state.security.secret;
    if (!secret) throw httpError(503, "服务尚未初始化，请稍后重试");

    if (!verifyCaptcha(secret, captchaId, captchaAnswer)) {
      recordFailure(ip);
      throw httpError(400, "人机验证失败，请刷新后重新输入");
    }

    if (username !== state.security.username || !verifyPassword(password, state.security.passwordHash)) {
      recordFailure(ip);
      throw httpError(401, "用户名或密码不正确");
    }

    clearFailures(ip);
    const { token, expiresAt } = signToken(
      { username: state.security.username, passwordVersion: state.security.passwordVersion },
      secret
    );
    res.json({ token, expiresAt, username: state.security.username });
  })
);

app.get(
  "/api/admin/session",
  requireAuth,
  asyncRoute(async (req, res) => {
    res.json({ username: req.admin.name, expiresAt: req.admin.exp });
  })
);

app.post(
  "/api/admin/password",
  requireAuth,
  asyncRoute(async (req, res) => {
    const current = typeof req.body?.current === "string" ? req.body.current : "";
    const next = typeof req.body?.next === "string" ? req.body.next : "";
    if (next.length < 8) throw httpError(400, "新密码至少 8 位");

    const state = await readState();
    if (!verifyPassword(current, state.security.passwordHash)) {
      throw httpError(400, "当前密码不正确");
    }

    await updateState((draft) => {
      draft.security.passwordHash = hashPassword(next);
      draft.security.passwordVersion = (Number(draft.security.passwordVersion) || 0) + 1;
      draft.security.updatedAt = Date.now();
      audit(draft, "admin.password", "修改管理员密码");
    });

    res.json({ ok: true });
  })
);

/* ============================ 概览 ============================ */

app.get(
  "/api/admin/overview",
  requireAuth,
  asyncRoute(async (_req, res) => {
    res.json(overviewView(await readState()));
  })
);

/* ============================ 版本发布 ============================ */

app.get(
  "/api/admin/release",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const state = await readState();
    res.json(cloneRelease(state.release));
  })
);

app.put(
  "/api/admin/release",
  requireAuth,
  asyncRoute(async (req, res) => {
    const saved = await updateState((state) => {
      const next = cleanRelease(req.body || {}, state.release);
      state.release = next;
      audit(state, "release.save", `${next.version}${next.force ? "（强制）" : ""}`);
      return cloneRelease(next);
    });
    res.json(saved);
  })
);

app.post(
  "/api/admin/release/sync-github",
  requireAuth,
  asyncRoute(async (req, res) => {
    const state = await readState();
    const github = state.settings.github;
    const repo = text(req.body?.repo, 120) || github.repo;
    if (!isValidRepo(repo)) throw httpError(400, "请先在设置里填写 GitHub 仓库（owner/repo）");

    const tag = text(req.body?.tag, 120);
    const pattern = req.body?.pattern === undefined ? github.assetPattern : text(req.body.pattern, 200);
    if (pattern && !safePattern(pattern)) throw httpError(400, "资产匹配正则无效");

    const release = tag
      ? await getReleaseByTag(repo, tag, githubTokenOf(state))
      : await getLatestRelease(repo, githubTokenOf(state));
    if (!release) throw httpError(404, tag ? `找不到 tag ${tag}` : "该仓库还没有发布 Release");

    const mapped = mapGithubRelease(release, { pattern, previous: state.release });
    const { assetName, ...preview } = mapped;

    await updateState((draft) => {
      draft.sync = {
        lastAt: Date.now(),
        lastTag: release.tag_name || "",
        lastVersion: preview.version,
        lastError: "",
      };
      audit(draft, "release.sync-github", `${release.tag_name || ""} / ${assetName || "无匹配资产"}`);
    });

    res.json({
      release: preview,
      asset: assetName
        ? { name: assetName, size: preview.size, url: preview.downloadUrl }
        : null,
      matched: Boolean(preview.downloadUrl),
      message: preview.downloadUrl
        ? `已从 GitHub Releases 拉取 ${release.tag_name || preview.version}`
        : "已拉取版本信息，但没有匹配到安装包资产，请手动填写下载地址",
    });
  })
);

app.get(
  "/api/admin/github/releases",
  requireAuth,
  asyncRoute(async (req, res) => {
    const state = await readState();
    const repo = state.settings.github.repo;
    if (!isValidRepo(repo)) throw httpError(400, "请先在设置里填写 GitHub 仓库（owner/repo）");
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const releases = await listReleases(repo, githubTokenOf(state), limit);
    res.json({
      items: releases.map((item) => ({
        tag: item.tag_name || "",
        name: item.name || "",
        publishedAt: Date.parse(item.published_at || "") || 0,
        prerelease: Boolean(item.prerelease),
        draft: Boolean(item.draft),
        assets: (Array.isArray(item.assets) ? item.assets : []).map((asset) => ({
          name: asset.name,
          size: asset.size,
          url: asset.browser_download_url,
        })),
      })),
    });
  })
);

/* ============================ 公告 ============================ */

app.get(
  "/api/admin/announcements",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const state = await readState();
    const items = [...state.announcements].sort(
      (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt
    );
    res.json({ items });
  })
);

app.post(
  "/api/admin/announcements",
  requireAuth,
  asyncRoute(async (req, res) => {
    const created = await updateState((state) => {
      const base = cleanAnnouncement(req.body || {});
      const item = { ...base, id: nextId(state.announcements), createdAt: Date.now() };
      state.announcements.unshift(item);
      audit(state, "announcement.create", item.title);
      return item;
    });
    res.status(201).json(created);
  })
);

app.put(
  "/api/admin/announcements/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const updated = await updateState((state) => {
      const item = state.announcements.find((entry) => Number(entry.id) === id);
      if (!item) throw httpError(404, "公告不存在");
      Object.assign(item, cleanAnnouncement(req.body || {}, item));
      audit(state, "announcement.update", item.title);
      return item;
    });
    res.json(updated);
  })
);

app.delete(
  "/api/admin/announcements/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    await updateState((state) => {
      const index = state.announcements.findIndex((entry) => Number(entry.id) === id);
      if (index < 0) throw httpError(404, "公告不存在");
      const [removed] = state.announcements.splice(index, 1);
      audit(state, "announcement.delete", removed.title);
    });
    res.json({ ok: true });
  })
);

/* ============================ 镜像节点 ============================ */

app.get(
  "/api/admin/mirrors",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const state = await readState();
    const items = [...state.mirrors].sort(
      (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.id - b.id
    );
    res.json({ items });
  })
);

app.post(
  "/api/admin/mirrors",
  requireAuth,
  asyncRoute(async (req, res) => {
    const created = await updateState((state) => {
      const base = cleanMirror(req.body || {});
      const item = { ...base, id: nextId(state.mirrors), createdAt: Date.now() };
      state.mirrors.push(item);
      audit(state, "mirror.create", `${item.name} / ${item.scope}`);
      return item;
    });
    res.status(201).json(created);
  })
);

app.put(
  "/api/admin/mirrors/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    const updated = await updateState((state) => {
      const item = state.mirrors.find((entry) => Number(entry.id) === id);
      if (!item) throw httpError(404, "镜像节点不存在");
      Object.assign(item, cleanMirror(req.body || {}, item));
      audit(state, "mirror.update", `${item.name} / ${item.scope}`);
      return item;
    });
    res.json(updated);
  })
);

app.delete(
  "/api/admin/mirrors/:id",
  requireAuth,
  asyncRoute(async (req, res) => {
    const id = Number(req.params.id);
    await updateState((state) => {
      const index = state.mirrors.findIndex((entry) => Number(entry.id) === id);
      if (index < 0) throw httpError(404, "镜像节点不存在");
      const [removed] = state.mirrors.splice(index, 1);
      audit(state, "mirror.delete", removed.name);
    });
    res.json({ ok: true });
  })
);

/* ============================ 设置 ============================ */

app.get(
  "/api/admin/settings",
  requireAuth,
  asyncRoute(async (_req, res) => {
    const state = await readState();
    res.json(settingsView(state));
  })
);

app.put(
  "/api/admin/settings",
  requireAuth,
  asyncRoute(async (req, res) => {
    const body = req.body || {};
    const saved = await updateState((state) => {
      const settings = state.settings;

      if (body.siteName !== undefined) {
        const siteName = text(body.siteName, 80);
        if (siteName) settings.siteName = siteName;
      }
      if (body.channel !== undefined) {
        const channel = text(body.channel, 20);
        if (channel) settings.channel = channel;
      }

      if (body.github && typeof body.github === "object") {
        if (body.github.repo !== undefined) {
          const repo = text(body.github.repo, 120);
          if (repo && !isValidRepo(repo)) throw httpError(400, "GitHub 仓库格式应为 owner/repo");
          settings.github.repo = repo;
        }
        if (typeof body.github.token === "string" && body.github.token.trim()) {
          settings.github.token = body.github.token.trim().slice(0, 300);
        }
        if (body.github.clearToken === true) settings.github.token = "";
        if (body.github.assetPattern !== undefined) {
          const pattern = text(body.github.assetPattern, 200);
          if (pattern && !safePattern(pattern)) throw httpError(400, "资产匹配正则无效");
          settings.github.assetPattern = pattern;
        }
        if (body.github.autoSync !== undefined) settings.github.autoSync = bool(body.github.autoSync);
      }

      if (body.regenerateCronSecret === true) {
        settings.cronSecret = randomHex(16);
      } else if (typeof body.cronSecret === "string" && body.cronSecret.trim()) {
        settings.cronSecret = body.cronSecret.trim().slice(0, 120);
      }

      audit(state, "settings.update", "");
      return settingsView(state);
    });

    res.json(saved);
  })
);

/* ============================ 公开接口 ============================ */

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: SERVICE_NAME, time: Date.now() });
});

const updateHandler = asyncRoute(async (req, res) => {
  const state = await readState();
  maybeAutoSync(state);
  await recordStat("updateChecks");

  const payload = buildPublicUpdate(state, req.query || {});
  if (!payload) throw httpError(404, "还没有发布任何版本");

  res.setHeader("Cache-Control", "no-store");
  res.json(payload);
});

app.get("/api/v1/update", updateHandler);
app.get("/api/update/latest", asyncRoute(async (req, res) => {
  const state = await readState();
  maybeAutoSync(state);
  await recordStat("updateChecks");
  const payload = buildPublicUpdate(state, req.query || {});
  if (!payload) throw httpError(404, "还没有发布任何版本");
  res.setHeader("Cache-Control", "no-store");
  res.json(toLegacyUpdate(payload));
}));

const announcementsHandler = asyncRoute(async (_req, res) => {
  const state = await readState();
  const now = Date.now();
  const items = state.announcements
    .filter((item) => item.enabled !== false && (!item.expiresAt || item.expiresAt > now))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.createdAt - a.createdAt)
    .slice(0, 20)
    .map(publicAnnouncement);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items });
});

app.get("/api/v1/announcements", announcementsHandler);
app.get("/api/announcements", announcementsHandler);

const mirrorsHandler = asyncRoute(async (req, res) => {
  const state = await readState();
  const scope = req.query?.scope === "game" || req.query?.scope === "update" ? req.query.scope : "";
  const items = state.mirrors
    .filter((item) => item.enabled !== false && (!scope || item.scope === scope))
    .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0) || a.id - b.id)
    .map(publicMirror);
  res.setHeader("Cache-Control", "no-store");
  res.json({ items });
});

app.get("/api/v1/mirrors", mirrorsHandler);
app.get("/api/mirrors", mirrorsHandler);

app.post("/api/v1/stats/launch", asyncRoute(async (_req, res) => {
  await recordStat("launches");
  res.json({ ok: true });
}));
app.post("/api/stats/launch", asyncRoute(async (_req, res) => {
  await recordStat("launches");
  res.json({ ok: true });
}));

app.get("/api/v1/public-mirrors", asyncRoute(async (_req, res) => {
  const state = await readState();
  res.json({ items: publicMirrors(state, "game") });
}));

/* ============================ 定时同步 ============================ */

app.post(
  "/api/cron/sync",
  asyncRoute(async (req, res) => {
    const state = await readState();
    const expected = state.settings.cronSecret || CRON_SECRET;
    if (!expected) throw httpError(503, "未配置定时同步密钥");

    const provided = req.get("x-cron-secret") || text(req.query?.token, 200);
    if (provided !== expected) throw httpError(401, "同步密钥不正确");

    const repo = state.settings.github.repo;
    if (!isValidRepo(repo)) throw httpError(400, "请先在设置里填写 GitHub 仓库");

    const release = await getLatestRelease(repo, githubTokenOf(state));
    if (!release) throw httpError(404, "该仓库还没有发布 Release");

    const mapped = mapGithubRelease(release, {
      pattern: state.settings.github.assetPattern,
      previous: state.release,
    });

    const saved = await updateState((draft) => {
      draft.release = {
        ...mapped,
        force: draft.release.force,
        minSupported: draft.release.minSupported,
      };
      draft.sync = {
        lastAt: Date.now(),
        lastTag: release.tag_name || "",
        lastVersion: mapped.version,
        lastError: "",
      };
      audit(draft, "release.cron-sync", `${release.tag_name || ""} → ${mapped.version}`);
      return cloneRelease(draft.release);
    });

    res.json({ ok: true, release: saved });
  })
);

/* ============================ 管理后台静态资源 ============================ */

const adminIndex = path.join(ADMIN_DIST, "index.html");

if (existsSync(ADMIN_DIST)) {
  app.use(
    express.static(ADMIN_DIST, {
      index: false,
      maxAge: "1h",
      setHeaders: (res, filePath) => {
        if (filePath.endsWith("index.html")) res.setHeader("Cache-Control", "no-store");
      },
    })
  );
}

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/")) {
    next();
    return;
  }
  if (existsSync(adminIndex)) {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(adminIndex);
    return;
  }
  res
    .status(503)
    .type("html")
    .send(
      "<!doctype html><meta charset=\"utf-8\"><title>shenv-update</title><body style=\"font:14px/1.7 system-ui;padding:40px;background:#0b0e14;color:#e6ebf5\"><h1>管理后台尚未构建</h1><p>在项目根目录执行 <code>npm run build</code>，会构建 <code>admin/</code> 并生成静态资源。</p><p>接口仍在运行：<a style=\"color:#4ade80\" href=\"/api/health\">/api/health</a></p>"
    );
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = Number(error?.status) || 500;
  if (status >= 500) console.error("[app]", error);
  res.status(status).json({ error: error?.message || "服务器内部错误" });
});
