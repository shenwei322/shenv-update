import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DATA_DIR,
  IS_GITHUB_STORAGE,
  PUBLIC_BASE_URL,
  STATE_BRANCH,
  STATE_PATH,
  STATE_REPO,
  STATE_TOKEN,
} from "./config.js";
import { getRepoFile, putRepoFile } from "./github.js";

const STATE_FILE = path.join(DATA_DIR, "state.json");
const FILE_TTL = 1000;
const GITHUB_TTL = 15000;

export function initialState() {
  const now = Date.now();
  return {
    version: 1,
    security: {
      username: "",
      passwordHash: "",
      passwordVersion: 0,
      secret: "",
      updatedAt: 0,
    },
    settings: {
      siteName: "Turf Launcher 更新服务",
      channel: "stable",
      apiBase: PUBLIC_BASE_URL,
      github: {
        repo: process.env.GITHUB_REPO || "shenwei322/turf-launcher-web",
        token: "",
        assetPattern: "(?i)(setup\\.exe|\\.msi)$",
        autoSync: false,
      },
      cronSecret: process.env.CRON_SECRET || "",
    },
    release: {
      version: "0.2.0",
      title: "Turf Launcher 0.2.0",
      notes:
        "## 更新内容\n\n- 新增启动器启动自动更新检测\n- 新增更新弹窗、强制更新与跳过此版本\n- 新增公告与镜像节点推送\n- 下载完成后自动替换启动器并重启\n",
      force: false,
      channel: "stable",
      packageType: "portable",
      downloadUrl: "",
      sha256: "",
      size: 0,
      releaseUrl: "",
      minSupported: "0.0.0",
      publishedAt: now,
      updatedAt: now,
      source: "manual",
      mirrors: [],
    },
    announcements: [
      {
        id: 1,
        title: "更新服务已就绪",
        content:
          "这是由管理后台推送的第一条公告。\n\n在后台可以发布版本更新、公告与镜像节点，启动器每次启动都会自动检查。",
        pinned: true,
        level: "info",
        enabled: true,
        createdAt: now,
        expiresAt: 0,
      },
    ],
    mirrors: [
      {
        id: 1,
        name: "BMCLAPI 镜像",
        url: "https://bmclapi2.bangbang93.com",
        scope: "game",
        region: "cn",
        enabled: true,
        sortOrder: 0,
        createdAt: now,
      },
    ],
    stats: {
      updateChecks: 0,
      launches: 0,
      lastUpdateCheckAt: 0,
      lastLaunchAt: 0,
      daily: {},
    },
    sync: { lastAt: 0, lastTag: "", lastVersion: "", lastError: "" },
    audit: [],
  };
}

let cache = null;
let cacheAt = 0;
let loading = null;
let remoteSha = "";
let writeQueue = Promise.resolve();
let statTimer = null;

function ttl() {
  return IS_GITHUB_STORAGE ? GITHUB_TTL : FILE_TTL;
}

async function loadFromFile() {
  try {
    const text = await readFile(STATE_FILE, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

async function loadFromGithub() {
  const file = await getRepoFile(STATE_REPO, STATE_PATH, STATE_BRANCH, STATE_TOKEN);
  if (!file) {
    remoteSha = "";
    return null;
  }
  remoteSha = file.sha || "";
  const text = Buffer.from(file.content || "", file.encoding === "base64" ? "base64" : "utf8").toString(
    "utf8"
  );
  return JSON.parse(text);
}

async function loadRaw() {
  return IS_GITHUB_STORAGE ? loadFromGithub() : loadFromFile();
}

function normalizeState(raw) {
  const base = initialState();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    security: { ...base.security, ...(raw.security || {}) },
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      github: { ...base.settings.github, ...(raw.settings?.github || {}) },
    },
    release: { ...base.release, ...(raw.release || {}) },
    announcements: Array.isArray(raw.announcements) ? raw.announcements : base.announcements,
    mirrors: Array.isArray(raw.mirrors) ? raw.mirrors : base.mirrors,
    stats: {
      ...base.stats,
      ...(raw.stats || {}),
      daily: raw.stats && typeof raw.stats.daily === "object" && raw.stats.daily ? raw.stats.daily : {},
    },
    sync: { ...base.sync, ...(raw.sync || {}) },
    audit: Array.isArray(raw.audit) ? raw.audit : [],
  };
}

export async function readState() {
  if (cache && Date.now() - cacheAt < ttl()) return cache;
  if (!loading) {
    loading = (async () => {
      let lastError = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const raw = await loadRaw();
          const state = normalizeState(raw);
          cache = state;
          cacheAt = Date.now();
          return state;
        } catch (error) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
        }
      }
      throw lastError || new Error("读取状态失败");
    })().finally(() => {
      loading = null;
    });
  }
  return loading;
}

async function saveToFile(state) {
  await mkdir(DATA_DIR, { recursive: true });
  const temp = `${STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(state, null, 2), "utf8");
  await rename(temp, STATE_FILE);
}

async function saveToGithub(state) {
  const content = JSON.stringify(state, null, 2);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await putRepoFile(STATE_REPO, STATE_PATH, STATE_BRANCH, STATE_TOKEN, {
        content,
        sha: remoteSha || undefined,
      });
      if (result?.content?.sha) remoteSha = result.content.sha;
      return;
    } catch (error) {
      if (attempt === 0 && error && (error.status === 409 || error.status === 422)) {
        const fresh = await loadFromGithub();
        remoteSha = fresh && fresh.sha ? fresh.sha : remoteSha;
        continue;
      }
      throw error;
    }
  }
  throw new Error("写入 GitHub 状态失败");
}

async function persist(state) {
  cache = state;
  if (IS_GITHUB_STORAGE) await saveToGithub(state);
  else await saveToFile(state);
  cacheAt = Date.now();
}

function enqueue(task) {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function updateState(mutator) {
  return enqueue(async () => {
    const state = await readState();
    const draft = structuredClone(state);
    const result = mutator(draft);
    await persist(draft);
    return result;
  });
}

export async function ensureState() {
  if (process.env.VERCEL && !IS_GITHUB_STORAGE) {
    throw new Error(
      "Vercel 部署需要配置 STATE_REPO 与 STATE_TOKEN，把状态写入 GitHub 私有仓库；不能使用本地文件存储"
    );
  }
  const raw = await loadRaw();
  if (!raw) {
    const state = initialState();
    await enqueue(() => persist(state));
    return state;
  }
  const state = normalizeState(raw);
  cache = state;
  cacheAt = Date.now();
  return state;
}

export async function ensureSecret(generate) {
  const state = await readState();
  if (state.security.secret) return state.security.secret;
  const secret = generate();
  await updateState((draft) => {
    draft.security.secret = secret;
  });
  return secret;
}

export function scheduleStatPersist() {
  if (statTimer) return;
  statTimer = setTimeout(() => {
    statTimer = null;
    void enqueue(async () => {
      const state = await readState();
      await persist(state);
    }).catch((error) => console.error("[state] 统计写入失败", error));
  }, IS_GITHUB_STORAGE ? 30000 : 1200);
  if (typeof statTimer.unref === "function") statTimer.unref();
}

export async function flushStats() {
  if (statTimer) {
    clearTimeout(statTimer);
    statTimer = null;
  }
  const state = await readState();
  await enqueue(() => persist(state));
}

function pruneDaily(daily) {
  const days = Object.keys(daily).sort();
  while (days.length > 60) {
    const day = days.shift();
    delete daily[day];
  }
}

export async function recordStat(field) {
  const state = await readState();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const stats = state.stats;
  if (!stats.daily[day]) stats.daily[day] = { checks: 0, launches: 0 };

  if (field === "updateChecks") {
    stats.updateChecks += 1;
    stats.lastUpdateCheckAt = Date.now();
    stats.daily[day].checks += 1;
  } else if (field === "launches") {
    stats.launches += 1;
    stats.lastLaunchAt = Date.now();
    stats.daily[day].launches += 1;
  } else {
    return;
  }

  pruneDaily(stats.daily);
  scheduleStatPersist();
}

export function statSeries(state, days = 14) {
  const out = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate()
    ).padStart(2, "0")}`;
    const row = state.stats.daily[key] || { checks: 0, launches: 0 };
    out.push({ day: key, checks: Number(row.checks) || 0, launches: Number(row.launches) || 0 });
  }
  return out;
}

export function audit(state, action, detail = "") {
  state.audit.unshift({ at: Date.now(), action, detail });
  state.audit = state.audit.slice(0, 50);
}

export function nextId(list) {
  return list.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

export function stateFileExists() {
  return existsSync(STATE_FILE);
}
