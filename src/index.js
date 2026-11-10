import { app } from "./app.js";
import { bootstrap } from "./bootstrap.js";
import {
  DEFAULT_ADMIN_PASSWORD,
  IS_GITHUB_STORAGE,
  PORT,
  PUBLIC_BASE_URL,
} from "./config.js";
import { flushStats } from "./store.js";

async function main() {
  const info = await bootstrap();

  const server = app.listen(PORT, () => {
    console.log(`[shenv-update] api      http://127.0.0.1:${PORT}/api/health`);
    console.log(`[shenv-update] admin    http://127.0.0.1:${PORT}/`);
    console.log(`[shenv-update] public   ${PUBLIC_BASE_URL}`);
    console.log(`[shenv-update] storage  ${IS_GITHUB_STORAGE ? "github" : "file"}`);
    if (info.firstRun) {
      console.log(
        `[shenv-update] 首次启动已创建管理员：${info.username} / ${DEFAULT_ADMIN_PASSWORD}（登录后请在设置页修改）`
      );
    }
  });

  const shutdown = async (signal) => {
    console.log(`[shenv-update] ${signal}，正在保存状态`);
    server.close();
    try {
      await flushStats();
    } catch (error) {
      console.error("[shenv-update] 状态保存失败", error);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[shenv-update] 启动失败", error);
  process.exit(1);
});
