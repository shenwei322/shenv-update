import { randomHex } from "./crypto.js";
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USER,
  PUBLIC_BASE_URL,
} from "./config.js";
import { ensureState, updateState } from "./store.js";
import { hashPassword } from "./crypto.js";

let bootstrapPromise = null;

async function run() {
  const state = await ensureState();
  const needsInit =
    !state.security.username ||
    !state.security.passwordHash ||
    !state.security.secret ||
    !state.settings.cronSecret ||
    !state.settings.apiBase;

  if (!needsInit) {
    return { firstRun: false, username: state.security.username };
  }

  return updateState((draft) => {
    let firstRun = false;
    if (!draft.security.username || !draft.security.passwordHash) {
      draft.security.username = DEFAULT_ADMIN_USER;
      draft.security.passwordHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
      draft.security.passwordVersion = 1;
      draft.security.updatedAt = Date.now();
      firstRun = true;
    }
    if (!draft.security.secret) draft.security.secret = randomHex(32);
    if (!draft.settings.cronSecret) draft.settings.cronSecret = randomHex(16);
    if (!draft.settings.apiBase) draft.settings.apiBase = PUBLIC_BASE_URL;
    return {
      firstRun,
      username: draft.security.username,
      passwordVersion: draft.security.passwordVersion,
    };
  });
}

export function bootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = run().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}
