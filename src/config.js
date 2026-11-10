import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, "..");
export const ADMIN_DIST = path.join(ROOT_DIR, "admin", "dist");
export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT_DIR, "data"));

export const PORT = Number(process.env.PORT) || 8090;
export const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || "https://api.shenv.top").replace(
  /\/+$/,
  ""
);

export const DEFAULT_ADMIN_USER = (process.env.ADMIN_USER || "admin").trim() || "admin";
export const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "ChangeMe_2026";

export const SESSION_SECRET = process.env.SESSION_SECRET || "";
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
export const CRON_SECRET = process.env.CRON_SECRET || "";

export const STATE_REPO = process.env.STATE_REPO || "";
export const STATE_TOKEN = process.env.STATE_TOKEN || "";
export const STATE_PATH = process.env.STATE_PATH || "data/state.json";
export const STATE_BRANCH = process.env.STATE_BRANCH || "main";
export const IS_GITHUB_STORAGE = Boolean(STATE_REPO && STATE_TOKEN);

export const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
export const CAPTCHA_TTL_MS = 5 * 60 * 1000;
export const MAX_BODY = "256kb";
export const DEFAULT_CHANNEL = "stable";

export const SERVICE_NAME = "shenv-update";
