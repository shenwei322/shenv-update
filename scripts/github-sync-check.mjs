// 手动检查 GitHub Releases 映射：node scripts/github-sync-check.mjs [owner/repo]
const BASE = process.env.BASE_URL || "http://127.0.0.1:8090";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASSWORD || "ChangeMe_2026";
const REPO = process.argv[2] || "microsoft/PowerToys";
const PATTERN = process.env.ASSET_PATTERN || "(?i)PowerToysSetup-.*-x64\\.exe$";

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

const captcha = await request("/api/auth/captcha");
const svg = String(captcha.data?.svg || "");
const answer = [...svg.matchAll(/<text[^>]*>([A-Z0-9])<\/text>/g)].map((match) => match[1]).join("");
const login = await request("/api/auth/login", {
  method: "POST",
  body: { username: USER, password: PASS, captchaId: captcha.data?.id, captchaAnswer: answer },
});
if (!login.data?.token) {
  console.error("登录失败", login);
  process.exit(1);
}

const sync = await request("/api/admin/release/sync-github", {
  method: "POST",
  token: login.data.token,
  body: { repo: REPO, pattern: PATTERN },
});

console.log("status:", sync.status);
console.log(JSON.stringify(sync.data, null, 2));
process.exit(sync.status === 200 && sync.data?.matched ? 0 : 1);
