# shenv-update

Turf Launcher 的更新推送服务与管理后台。正式域名按 `https://api.shenv.top` 部署，启动器每次启动请求一次更新接口。

- 服务端：Node.js 20+ / Express 4，零原生依赖
- 管理后台：React 19 + TypeScript + Vite + GSAP
- 数据：本地 `data/state.json`，或 GitHub 私有仓库（无持久磁盘的免费平台）
- 登录：账号密码 + SVG 人机验证码 + 失败锁定

## 功能

| 模块 | 能力 |
| --- | --- |
| 更新推送 | 版本号、更新说明（Markdown）、下载地址、SHA256、文件大小、包类型（portable / installer）、通道、最低支持版本、强制更新 |
| GitHub Releases | 按 tag 拉取版本号、更新说明、安装包资产、SHA256、发布时间；可开自动同步；支持 Actions 定时回调 |
| 公告推送 | 标题、Markdown 内容、级别（info / warning / important）、置顶、启用、过期时间 |
| 镜像节点 | `update` 节点参与启动器更新下载回退；`game` 节点用于游戏资源镜像 |
| 统计 | 更新检查次数、启动次数、最近 14 天曲线 |
| 安全 | scrypt 密码哈希、HMAC token（12h）、改密后旧 token 失效、登录失败 5 次锁 10 分钟 |

## 快速开始

```bash
npm install
npm run build      # 安装并构建 admin/
npm start          # http://127.0.0.1:8090
```

首次启动会创建管理员并写入 `data/state.json`：

```text
账号：admin
密码：ChangeMe_2026
```

登录后到「设置 → 修改密码」改掉默认密码。

开发模式（两个终端）：

```bash
npm run dev        # API: http://127.0.0.1:8090
npm run admin:dev  # 后台: http://127.0.0.1:5174（/api 代理到 8090）
```

自检：

```bash
npm run smoke      # 需要 API 已启动，覆盖登录、验证码、发布、公告、镜像、公开接口
```

## 后台使用

1. 登录：账号、密码、验证码。登录页只保留登录卡片，不再展示品牌介绍与默认密码提示。
2. 界面为白色主题，卡片与侧栏带阴影；顶部「收起侧栏」按钮可把侧栏收成图标栏，状态会记在 localStorage。
3. 更新推送：页面顶部直接列出当前仓库最近的 GitHub Releases（预发布带标记），点选任意一条即可拉取版本、说明、资产与 SHA256 预览，确认后填入表单。
4. 公告：新建公告，选级别与是否置顶；启动器启动时会弹未读公告，首页也会列出。
5. 镜像节点：添加更新包直链，启动器下载时会自动按顺序回退。
6. 设置：GitHub 仓库、Token、资产匹配正则、自动同步、定时同步密钥、修改密码。

### 强制更新

- 打开「强制更新」后，启动器不显示「跳过此版本」，只能更新或退出启动器。
- 「最低支持版本」高于客户端版本时，客户端同样按强制更新处理。
- 跳过记录只对当前版本生效，更高版本仍会提示。

### 关联 GitHub Releases

- 仓库格式 `owner/repo`，可填 Token 提升 API 限额并支持私有仓库。
- 资产匹配正则默认 `(?i)(setup\.exe|\.msi)$`；匹配到 `setup.exe` / `.msi` 时包类型自动记为 `installer`。
- 自动同步只更新 `source=github` 的发布，避免覆盖后台手写的文案。
- Actions 定时同步见 `.github/workflows/sync-release.yml`：仓库 Secrets 配 `SHENV_API_BASE` 与 `SHENV_CRON_SECRET`（与后台 cronSecret 一致）。

## 部署到 GitHub（免费）

`api.shenv.top` 采用 **GitHub 仓库 + Vercel Hobby（免费）**：代码、Releases 和状态数据都在 GitHub，Vercel 只负责运行 Node API 与托管管理后台。

> GitHub Pages 只能托管静态文件，无法执行登录、验证码、写接口和 GitHub 状态同步；因此不要用纯 Pages 部署这个服务。下面的方案不需要服务器和付费套餐。

### 方式一：GitHub + Vercel（免费，推荐）

### 1. 准备两个 GitHub 仓库

- **代码仓库**：`shenv-update`，放本目录（public/private 均可）。
- **状态仓库**：`shenv-state`，必须 **private**，只保存 `data/state.json`。

### 2. 创建状态仓库 Token

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token：

- Repository access：只选 `shenv-state`；
- Permissions：Contents → Read and write；
- 生成后复制 `github_pat_...`。

### 3. 推到 GitHub

```bash
cd D:\api\shenv-update
git init
git add .
git commit -m "feat: shenv update service"
git branch -M main
git remote add origin https://github.com/<你的账号>/shenv-update.git
git push -u origin main
```

`.gitignore` 已排除 `node_modules`、`admin/dist`、`data/state.json`、`.env`。

### 4. 导入 Vercel（免费）

1. 打开 <https://vercel.com/new>，选择 `shenv-update` 仓库。
2. Framework Preset 选 **Other**；构建与输出由根目录 `vercel.json` 接管。
3. 在 Environment Variables 添加（Production 与 Preview）：

| 变量 | 值 |
| --- | --- |
| `PUBLIC_BASE_URL` | `https://api.shenv.top` |
| `ADMIN_USER` | `admin` |
| `ADMIN_PASSWORD` | 首次登录用的强密码 |
| `SESSION_SECRET` | 至少 32 位随机字符串 |
| `STATE_REPO` | `<你的账号>/shenv-state` |
| `STATE_TOKEN` | 第 2 步的 `github_pat_...` |
| `STATE_PATH` | `state.json` |
| `STATE_BRANCH` | `main` |
| `GITHUB_REPO`（可选） | 启动器所在仓库，如 `<账号>/turf-launcher-web` |
| `GITHUB_TOKEN`（可选） | 读取私有 Release 或提高 API 限额 |
| `CRON_SECRET`（可选） | 与后台 `cronSecret` 一致 |

4. 点 Deploy。构建会执行 `admin` 的 Vite 构建，并生成 `/api` 与 `/api/*` 两个 Serverless Function。

### 5. 绑定 api.shenv.top

Vercel → Project → Settings → Domains → Add `api.shenv.top`，按提示添加 DNS：

- 类型：`CNAME`
- 名称：`api`
- 值：`cname.vercel-dns.com`

如果 DNS 托管在 Cloudflare，先设为 **DNS only（灰云）**，等 Vercel 签发 HTTPS 证书后再决定是否开代理。

### 6. 首次启动

打开 `https://api.shenv.top/`，用 `ADMIN_USER` / `ADMIN_PASSWORD` 登录。首次写入会把初始 `state.json` 提交到 `shenv-state` 私有仓库；登录后立即到「设置」改密码。

### 7. GitHub Actions 定时同步 Release

`.github/workflows/sync-release.yml` 已就绪，在**代码仓库**的 Actions Secrets 添加：

- `SHENV_API_BASE` = `https://api.shenv.top`
- `SHENV_CRON_SECRET` = 后台「设置」里的定时同步密钥

之后发布 Release 或定时任务会调用 `POST /api/cron/sync` 自动更新版本。

### 8. 验证

```bash
curl https://api.shenv.top/api/health
curl "https://api.shenv.top/api/v1/update?current=0.2.0&platform=windows&arch=x86_64"
```

应分别返回 `{"ok":true,...}` 和带 `version` 的 JSON。本地可先跑：

```bash
npm run vercel:check
```

它会模拟 Vercel 的 catch-all 路由，验证 `/api/health`、`/api/v1/update` 与未登录 401。

### 免费额度

Vercel Hobby 免费；`vercel.json` 已把函数上限设为 30 秒，冷启动约 1–2 秒。状态写 GitHub 会生成 commit，更新服务的请求量足够使用免费额度。

### 可选：从 GitHub Actions 部署

Vercel 的 Git 集成会在 push 后自动部署；如果更想在 GitHub Actions 里手动触发，使用 `.github/workflows/deploy-vercel.yml`：

1. 先在 Vercel 导入仓库，取得 Project Settings → General 里的 `Project ID` 与 `Team ID`（个人账号的 Team ID 即 Org ID）。
2. 在 GitHub 代码仓库 Secrets 添加：
   - `VERCEL_TOKEN`
   - `VERCEL_ORG_ID`
   - `VERCEL_PROJECT_ID`
3. GitHub → Actions → `deploy-vercel` → Run workflow。

两种方式二选一即可，同时开启会重复部署。

### 方式二：Render（备选）

1. 把本目录推到 GitHub。
2. Render → New → Blueprint，选择 `render.yaml`；或 New Web Service：
   - Build：`npm install && npm --prefix admin install && npm --prefix admin run build`
   - Start：`npm start`
3. 设置环境变量 `ADMIN_PASSWORD`、`SESSION_SECRET`（≥32 字符）、`PUBLIC_BASE_URL=https://api.shenv.top`。
4. Render 免费实例没有持久磁盘，配置 GitHub 存储（`STATE_REPO` / `STATE_TOKEN` / `STATE_PATH` / `STATE_BRANCH`）。
5. 自定义域名 `api.shenv.top` 指向 Render 域名，开启 HTTPS。

状态仓库必须是私有仓库：`state.json` 里含管理员密码哈希、token 签名密钥与 GitHub Token。

### 方式三：Docker

```bash
docker build -t shenv-update .
docker run -d --name shenv-update -p 8090:8090 \
  -v /srv/shenv/data:/app/data \
  -e ADMIN_PASSWORD='换成强密码' \
  -e SESSION_SECRET='至少32位随机字符串' \
  -e PUBLIC_BASE_URL='https://api.shenv.top' \
  shenv-update
```

反向代理到 8090，并配置 HTTPS。管理后台与 API 同源，无需额外 CORS。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `PORT` | 监听端口，默认 8090 |
| `PUBLIC_BASE_URL` | 对外地址，后台展示与默认 apiBase，默认 `https://api.shenv.top` |
| `ADMIN_USER` / `ADMIN_PASSWORD` | 首次启动创建的管理员；之后以后台改密为准 |
| `SESSION_SECRET` | token 签名密钥；不设时自动生成并存 state |
| `DATA_DIR` | file 模式数据目录，默认 `./data` |
| `STATE_REPO` / `STATE_TOKEN` / `STATE_PATH` / `STATE_BRANCH` | GitHub 存储模式；`STATE_REPO` 与 `STATE_TOKEN` 同时存在才生效 |
| `GITHUB_REPO` / `GITHUB_TOKEN` | GitHub Releases 同步默认值，可被后台设置覆盖 |
| `CRON_SECRET` | 定时同步默认密钥，可被后台 cronSecret 覆盖 |

## 接口

完整契约见 [`docs/API.md`](docs/API.md)。

启动器使用的公开接口：

```text
GET  /api/v1/update?current=0.2.0&platform=windows&arch=x86_64
GET  /api/v1/announcements
GET  /api/v1/mirrors?scope=update
POST /api/v1/stats/launch
```

旧路径 `/api/update/latest`、`/api/announcements`、`/api/mirrors`、`/api/stats/launch` 保持兼容。

## 启动器发布流程

当前启动器版本为 `0.2.0`（`src-tauri/tauri.conf.json`）。首次验证整条推送链路：

1. 启动服务，登录后台。
2. 「更新推送」把版本号改成 `0.2.1`，填标题与更新说明，下载地址先填 GitHub Release 资产直链（或任意可下载的 exe），保存。
3. 重启启动器：启动后自动请求 `GET /api/v1/update?current=0.2.0`，弹出更新窗口。
4. 勾选「强制更新」再保存，重启启动器：窗口不再显示「跳过此版本」。

正式发布：

1. 构建便携版（替换型）：
   ```bash
   npm run tauri -- build --no-bundle
   ```
   产物 `src-tauri/target/release/turf-launcher.exe`，上传 GitHub Release，命名为 `Turf.Launcher_<版本>_x64.exe`。
2. 或构建 NSIS 安装包（安装器型）：
   ```bash
   npm run tauri -- build
   ```
   产物 `*_x64-setup.exe`，后台包类型选 `installer`。
3. 在后台「更新推送」拉取 GitHub Release 或手填版本，发布。
4. 重启启动器：自动检测 → 弹窗展示版本与更新内容 → 下载（进度条）→ 校验 → 替换并重启。

便携版更新会下载到 `%TEMP%\turf-launcher-update`，由 PowerShell 脚本等待主进程退出后替换当前 exe 并重新启动。安装在 `Program Files` 且没有写权限时会回退到重启旧版本，此时改用安装器型更新。

## 目录

```text
src/                API 与静态托管
api/                Vercel Serverless 入口（/api 与 /api/*）
admin/              React 管理后台
docs/API.md         接口契约
scripts/smoke.mjs   本地接口自检
scripts/vercel-local-check.mjs  Vercel 路由自检
vercel.json         Vercel 构建、函数与安全响应头
.github/workflows/  CI 与 Releases 定时同步
data/               运行时状态（不入库）
```
