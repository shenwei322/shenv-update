import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { CAPTCHA_TTL_MS, TOKEN_TTL_MS } from "./config.js";

const CAPTCHA_CHARS = "ACDEFGHJKLMNPQRTUVWXY34679";

export function randomHex(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const expected = Buffer.from(hash, "hex");
  if (!expected.length) return false;
  const candidate = scryptSync(String(password), salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signToken({ username, passwordVersion }, secret) {
  const payload = {
    sub: "admin",
    name: username,
    pv: Number(passwordVersion) || 0,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `${body}.${mac}`, expiresAt: payload.exp };
}

export function readToken(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, mac] = parts;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (!safeEqual(mac, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function answerDigest(secret, answer) {
  return createHmac("sha256", secret)
    .update(String(answer).trim().toLowerCase())
    .digest("base64url")
    .slice(0, 32);
}

function renderCaptchaSvg(answer) {
  const width = 172;
  const height = 54;
  const palette = ["#2f7d46", "#6d4fd1", "#b23a6b", "#9a6b0f", "#2563eb", "#3f9d57"];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const round = (value) => value.toFixed(1);

  const noise = Array.from({ length: 26 }, () => {
    const cx = round(Math.random() * width);
    const cy = round(Math.random() * height);
    const r = round(0.6 + Math.random() * 1.6);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${pick(palette)}" opacity="${round(
      0.15 + Math.random() * 0.35
    )}"/>`;
  }).join("");

  const lines = Array.from({ length: 5 }, () => {
    const x1 = round(Math.random() * width);
    const y1 = round(Math.random() * height);
    const x2 = round(Math.random() * width);
    const y2 = round(Math.random() * height);
    return `<path d="M${x1} ${y1} Q${round(
      (Number(x1) + Number(x2)) / 2 + (Math.random() * 30 - 15)
    )} ${round(
      (Number(y1) + Number(y2)) / 2 + (Math.random() * 24 - 12)
    )} ${x2} ${y2}" stroke="${pick(palette)}" stroke-width="${round(
      0.8 + Math.random() * 1.4
    )}" fill="none" opacity="0.42"/>`;
  }).join("");

  const glyphs = [...answer]
    .map((char, index) => {
      const x = 20 + index * 36 + (Math.random() * 6 - 3);
      const y = 36 + (Math.random() * 8 - 4);
      const rotate = round(Math.random() * 34 - 17);
      const size = round(26 + Math.random() * 6);
      const color = pick(palette);
      return `<text x="${round(x)}" y="${round(y)}" fill="${color}" font-size="${size}" font-family="'Segoe UI','Microsoft YaHei',Arial,sans-serif" font-weight="700" transform="rotate(${rotate} ${round(
        x
      )} ${round(y)})">${char}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="人机验证码"><rect width="100%" height="100%" rx="10" fill="#f7f9f7"/><rect x="1" y="1" width="${
    width - 2
  }" height="${height - 2}" rx="9" fill="none" stroke="#dfe3e8"/>${noise}${lines}${glyphs}</svg>`;
}

export function createCaptcha(secret) {
  const answer = Array.from(
    { length: 4 },
    () => CAPTCHA_CHARS[Math.floor(Math.random() * CAPTCHA_CHARS.length)]
  ).join("");
  const payload = Buffer.from(
    JSON.stringify({ h: answerDigest(secret, answer), exp: Date.now() + CAPTCHA_TTL_MS })
  ).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
  return { id: `${payload}.${mac}`, svg: renderCaptchaSvg(answer), expiresIn: CAPTCHA_TTL_MS / 1000 };
}

export function verifyCaptcha(secret, id, input) {
  if (typeof id !== "string" || typeof input !== "string") return false;
  const trimmed = input.trim();
  if (!trimmed) return false;
  const [payload, mac] = id.split(".");
  if (!payload || !mac) return false;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
  if (!safeEqual(mac, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data || typeof data.exp !== "number" || data.exp < Date.now()) return false;
    return safeEqual(data.h, answerDigest(secret, trimmed));
  } catch {
    return false;
  }
}
