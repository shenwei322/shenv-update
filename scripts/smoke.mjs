const BASE = process.env.BASE_URL || "http://127.0.0.1:8090";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASSWORD || "ChangeMe_2026";

let failures = 0;

function ok(label, condition, detail = "") {
  const mark = condition ? "PASS" : "FAIL";
  if (!condition) failures += 1;
  console.log(`[${mark}] ${label}${detail ? ` — ${detail}` : ""}`);
}

async function request(pathname, { method = "GET", body, token } = {}) {
  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function captchaAnswer(svg) {
  return [...String(svg).matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map((match) => match[1]).join("");
}

async function main() {
  const health = await request("/api/health");
  ok("健康检查", health.status === 200 && health.data?.ok === true);

  const unauth = await request("/api/admin/overview");
  ok("未登录访问管理接口返回 401", unauth.status === 401, String(unauth.status));

  const captcha = await request("/api/auth/captcha");
  const answer = captchaAnswer(captcha.data?.svg);
  ok("验证码接口返回 SVG", captcha.status === 200 && answer.length === 4, `答案长度 ${answer.length}`);

  const wrongCaptcha = await request("/api/auth/login", {
    method: "POST",
    body: { username: USER, password: PASS, captchaId: captcha.data.id, captchaAnswer: "XXXX" },
  });
  ok("验证码错误被拒绝", wrongCaptcha.status === 400, String(wrongCaptcha.status));

  const captcha2 = await request("/api/auth/captcha");
  const answer2 = captchaAnswer(captcha2.data?.svg);
  const login = await request("/api/auth/login", {
    method: "POST",
    body: { username: USER, password: PASS, captchaId: captcha2.data.id, captchaAnswer: answer2 },
  });
  ok("正确账号密码 + 人机验证登录", login.status === 200 && Boolean(login.data?.token), login.data?.error);
  const token = login.data?.token;
  if (!token) {
    console.error("登录失败，后续用例中止");
    process.exit(1);
  }

  const session = await request("/api/admin/session", { token });
  ok("会话校验", session.status === 200 && session.data?.username === USER);

  const overview = await request("/api/admin/overview", { token });
  ok("概览结构", overview.status === 200 && Array.isArray(overview.data?.stats?.series), `series=${overview.data?.stats?.series?.length}`);

  const before = await request("/api/admin/release", { token });
  const original = before.data;
  ok("读取当前发布", before.status === 200 && Boolean(original?.version), original?.version);

  const publish = await request("/api/admin/release", {
    method: "PUT",
    token,
    body: {
      ...original,
      version: "9.9.9",
      title: "Smoke 测试版本",
      notes: "## 测试\n- 自动更新接口",
      force: true,
      downloadUrl: "https://example.com/Turf.Launcher_9.9.9_x64-setup.exe",
      sha256: "a".repeat(64),
      size: 1024,
      minSupported: "9.9.0",
      packageType: "installer",
      channel: "stable",
    },
  });
  ok("保存版本发布", publish.status === 200 && publish.data?.version === "9.9.9", publish.data?.error);

  const update = await request("/api/v1/update?current=0.2.0&platform=windows&arch=x86_64");
  ok(
    "启动器更新接口",
    update.status === 200 &&
      update.data?.hasUpdate === true &&
      update.data?.force === true &&
      update.data?.download?.url?.includes("9.9.9"),
    JSON.stringify({ hasUpdate: update.data?.hasUpdate, force: update.data?.force })
  );

  const legacy = await request("/api/update/latest");
  ok("旧版更新路径兼容", legacy.status === 200 && legacy.data?.mandatory === true);

  const missingVersion = await request("/api/admin/release", {
    method: "PUT",
    token,
    body: { ...original, version: "bad-version" },
  });
  ok("非法版本号被拒绝", missingVersion.status === 400, String(missingVersion.status));

  const announcement = await request("/api/admin/announcements", {
    method: "POST",
    token,
    body: { title: "Smoke 公告", content: "公告内容", level: "warning", pinned: true },
  });
  ok("创建公告", announcement.status === 201 && announcement.data?.id > 0);

  const publicAnnouncements = await request("/api/v1/announcements");
  ok(
    "公开公告包含新公告",
    publicAnnouncements.status === 200 &&
      publicAnnouncements.data.items.some((item) => item.title === "Smoke 公告")
  );

  const putAnnouncement = await request(`/api/admin/announcements/${announcement.data.id}`, {
    method: "PUT",
    token,
    body: { enabled: false },
  });
  ok("禁用公告", putAnnouncement.status === 200 && putAnnouncement.data?.enabled === false);

  const hidden = await request("/api/v1/announcements");
  ok(
    "禁用公告不再公开",
    !hidden.data.items.some((item) => item.id === announcement.data.id)
  );

  await request(`/api/admin/announcements/${announcement.data.id}`, { method: "DELETE", token });

  const mirror = await request("/api/admin/mirrors", {
    method: "POST",
    token,
    body: {
      name: "Smoke 节点",
      url: "https://example.com/Turf.Launcher.exe",
      scope: "update",
      region: "cn",
      enabled: true,
      sortOrder: 5,
    },
  });
  ok("创建镜像节点", mirror.status === 201 && mirror.data?.id > 0);

  const mirrors = await request("/api/v1/mirrors?scope=update");
  ok(
    "公开镜像包含新节点",
    mirrors.status === 200 && mirrors.data.items.some((item) => item.id === mirror.data.id)
  );

  const updateAgain = await request("/api/v1/update?current=0.2.0");
  ok(
    "更新接口合并镜像节点",
    updateAgain.data?.download?.mirrors?.some((item) => item.name === "Smoke 节点")
  );

  await request(`/api/admin/mirrors/${mirror.data.id}`, { method: "DELETE", token });

  const badMirror = await request("/api/admin/mirrors", {
    method: "POST",
    token,
    body: { name: "坏节点", url: "ftp://example.com/file" },
  });
  ok("非 http(s) 镜像被拒绝", badMirror.status === 400);

  const newest = await request("/api/v1/update?current=9.9.9");
  ok("客户端已高于发布版本时 hasUpdate=false", newest.data?.hasUpdate === false);

  const expired = await request("/api/admin/announcements", {
    method: "POST",
    token,
    body: { title: "过期公告", content: "不应公开", expiresAt: Date.now() - 1000 },
  });
  const publicAfterExpired = await request("/api/v1/announcements");
  ok(
    "过期公告不公开",
    !publicAfterExpired.data.items.some((item) => item.id === expired.data.id)
  );
  await request(`/api/admin/announcements/${expired.data.id}`, { method: "DELETE", token });

  const gameMirror = await request("/api/admin/mirrors", {
    method: "POST",
    token,
    body: {
      name: "游戏下载源",
      url: "https://example.com/game",
      scope: "game",
      region: "cn",
    },
  });
  const updateWithGame = await request("/api/v1/update?current=0.2.0");
  ok(
    "game 镜像不进入更新下载候选",
    !updateWithGame.data.download.mirrors.some((item) => item.name === "游戏下载源")
  );
  const gameOnly = await request("/api/v1/mirrors?scope=game");
  ok(
    "game scope 镜像可单独推送",
    gameOnly.data.items.some((item) => item.id === gameMirror.data.id)
  );
  await request(`/api/admin/mirrors/${gameMirror.data.id}`, { method: "DELETE", token });

  const cronNoSecret = await request("/api/cron/sync", { method: "POST" });
  ok("定时同步缺少密钥返回 401", cronNoSecret.status === 401, String(cronNoSecret.status));

  const settings = await request("/api/admin/settings", { token });
  ok("设置接口脱敏 token", settings.status === 200 && settings.data?.github?.hasToken !== undefined);

  const launch = await request("/api/v1/stats/launch", { method: "POST" });
  ok("启动计数", launch.status === 200 && launch.data?.ok === true);

  const restore = await request("/api/admin/release", {
    method: "PUT",
    token,
    body: { ...original, force: original.force, notes: original.notes },
  });
  ok("恢复原始发布", restore.status === 200 && restore.data?.version === original.version);

  const finalOverview = await request("/api/admin/overview", { token });
  ok(
    "统计已累计",
    finalOverview.status === 200 &&
      finalOverview.data.stats.updateChecks > 0 &&
      finalOverview.data.stats.launches > 0
  );

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("smoke 运行失败", error);
  process.exit(1);
});
