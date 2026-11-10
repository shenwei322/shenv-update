import { readToken } from "./crypto.js";
import { SESSION_SECRET } from "./config.js";
import { readState } from "./store.js";

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const buckets = new Map();

export function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

export function lockRemaining(ip) {
  const bucket = buckets.get(ip);
  if (!bucket) return 0;
  if (bucket.resetAt <= Date.now()) {
    buckets.delete(ip);
    return 0;
  }
  if (bucket.count < MAX_FAILURES) return 0;
  return Math.ceil((bucket.resetAt - Date.now()) / 1000);
}

export function recordFailure(ip) {
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
  }
  if (buckets.size > 5000) {
    for (const [key, value] of buckets) {
      if (value.resetAt <= now) buckets.delete(key);
    }
  }
}

export function clearFailures(ip) {
  buckets.delete(ip);
}

export async function sessionOf(req) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return null;

  const state = await readState();
  const secret = SESSION_SECRET || state.security.secret;
  if (!secret) return null;

  const payload = readToken(token, secret);
  if (!payload) return null;
  if ((Number(payload.pv) || 0) !== (Number(state.security.passwordVersion) || 0)) return null;
  return { payload, state, secret };
}

export function requireAuth(req, res, next) {
  sessionOf(req)
    .then((session) => {
      if (!session) {
        res.status(401).json({ error: "登录已过期，请重新登录" });
        return;
      }
      req.admin = session.payload;
      req.state = session.state;
      req.secret = session.secret;
      next();
    })
    .catch(next);
}
