import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { originalApiUrl, setExpressUrl } from "../src/vercel.js";

assert.equal(
  originalApiUrl({ path: ["v1", "update"], current: "0.2.0" }),
  "/api/v1/update?current=0.2.0"
);
assert.equal(originalApiUrl({ path: ["admin", "releases", "1"] }), "/api/admin/releases/1");
assert.equal(originalApiUrl({ path: "v1/announcements" }), "/api/v1/announcements");
assert.equal(
  originalApiUrl({ __path: "v1/update", current: "0.2.0" }),
  "/api/v1/update?current=0.2.0"
);
assert.equal(
  originalApiUrl({ __path: "admin/release/sync-github", pattern: "(?i)x" }),
  "/api/admin/release/sync-github?pattern=%28%3Fi%29x"
);

const rewritten = { url: "/api", query: { path: ["v1", "update"], current: "0.2.0" } };
setExpressUrl(rewritten);
assert.equal(rewritten.url, "/api/v1/update?current=0.2.0");

const rewriteVercel = { url: "/api/index", query: { __path: "v1/update", current: "0.2.0" } };
setExpressUrl(rewriteVercel);
assert.equal(rewriteVercel.url, "/api/v1/update?current=0.2.0");

const preserved = { url: "/api/v1/update?current=0.2.0", query: { path: ["v1", "update"], current: "0.2.0" } };
setExpressUrl(preserved);
assert.equal(preserved.url, "/api/v1/update?current=0.2.0");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "shenv-vercel-"));
process.env.DATA_DIR = dataDir;
process.env.ADMIN_PASSWORD = "ChangeMe_2026";
process.env.PUBLIC_BASE_URL = "http://127.0.0.1";

const { default: handler } = await import(
  pathToFileURL(path.resolve("api/[...path].js")).href
);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const segments = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  req.query = { path: segments };
  for (const [key, value] of url.searchParams) req.query[key] = value;
  try {
    await handler(req, res);
  } catch (error) {
    res.statusCode = 500;
    res.end(String(error));
  }
});

try {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const health = await fetch(`${base}/api/health`);
  assert.equal(health.status, 200);
  const healthData = await health.json();
  assert.equal(healthData.ok, true);

  const update = await fetch(`${base}/api/v1/update?current=0.2.0&platform=windows&arch=x86_64`);
  assert.equal(update.status, 200);
  const updateData = await update.json();
  assert.equal(updateData.version, "0.2.0");
  assert.equal(updateData.hasUpdate, false);
  assert.equal(updateData.current, "0.2.0");

  const unauthorized = await fetch(`${base}/api/admin/session`);
  assert.equal(unauthorized.status, 401);

  const captcha = await fetch(`${base}/api/auth/captcha`);
  assert.equal(captcha.status, 200);
  const captchaData = await captcha.json();
  assert.ok(String(captchaData.svg).includes("<svg"));

  const badLogin = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(badLogin.status, 400);

  console.log("Vercel catch-all 本地验证通过：health / update / captcha / admin 401 / JSON 400");
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
}
