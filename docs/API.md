# shenv-update API 契约

服务默认监听 `PORT`（默认 8090），正式域名按部署填写，启动器默认请求 `https://api.shenv.top`。
所有请求与响应均为 UTF-8 JSON，字段使用 camelCase，时间戳为毫秒。

## 1. 认证

管理接口使用 `Authorization: Bearer <token>`。token 由 `POST /api/auth/login` 签发，12 小时过期。

### GET /api/auth/captcha

人机验证码。返回内联 SVG，前端直接插入 DOM（服务端生成，可信）。

```json
{
  "id": "eyJoIjoi...c2ln",
  "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" ...></svg>",
  "expiresIn": 300
}
```

### POST /api/auth/login

```json
{ "username": "admin", "password": "ChangeMe_2026", "captchaId": "...", "captchaAnswer": "A7K2" }
```

成功：

```json
{ "token": "eyJzdWIiOiJhZG1pbi...mac", "expiresAt": 1762700000000, "username": "admin" }
```

失败统一返回 `401 { "error": "用户名或密码不正确" }`；验证码错误返回 `400 { "error": "人机验证失败，请重新输入" }`；
同 IP 连续失败 5 次锁定 10 分钟，返回 `429 { "error": "尝试次数过多，请稍后再试" }`。

### GET /api/admin/session

`{ "username": "admin", "expiresAt": 1762700000000 }`

### POST /api/admin/password

`{ "current": "...", "next": "..." }` → `{ "ok": true }`。改密后旧 token 立即失效（token 里带密码版本号）。

## 2. 管理接口

### GET /api/admin/overview

```json
{
  "stats": {
    "updateChecks": 128,
    "launches": 64,
    "lastUpdateCheckAt": 1762700000000,
    "lastLaunchAt": 1762700000000,
    "series": [{ "day": "2026-11-08", "checks": 12, "launches": 4 }]
  },
  "counts": { "announcements": 2, "mirrors": 3, "audits": 12 },
  "release": { "...": "同 GET /api/admin/release" },
  "github": { "repo": "shenwei322/turf-launcher-web", "autoSync": true, "lastAt": 0, "lastTag": "", "lastError": "" },
  "serverTime": 1762700000000
}
```

### GET /api/admin/release

```json
{
  "version": "0.2.1",
  "title": "Turf Launcher 0.2.1",
  "notes": "## 更新内容\n- ...",
  "force": false,
  "channel": "stable",
  "packageType": "portable",
  "downloadUrl": "https://github.com/.../Turf.Launcher.exe",
  "sha256": "64 位十六进制，可为空",
  "size": 12345678,
  "releaseUrl": "https://github.com/.../releases/tag/v0.2.1",
  "minSupported": "0.0.0",
  "publishedAt": 1762700000000,
  "updatedAt": 1762700000000,
  "source": "manual | github"
}
```

### PUT /api/admin/release

请求体为上述字段（`publishedAt` 省略时取当前时间）。版本号必须匹配 `^\d+(\.\d+){0,3}(-[0-9A-Za-z.-]+)?$`。
`force=true` 时启动器不提供「跳过」；`minSupported` 高于客户端版本时同样强制。
`packageType`：`portable` 直接替换启动器可执行文件；`installer` 运行安装包（`/S`）后启动。

响应为保存后的 release 对象。

### POST /api/admin/release/sync-github

```json
{ "repo": "owner/repo", "tag": "v0.2.1", "pattern": "(?i)(setup\\.exe|\\.msi|\\.zip)$" }
```

`repo` 省略时用设置里的仓库，`tag` 省略时取 latest，`pattern` 省略时用设置里的资产正则。只拉取、写入 `sync` 预览，不直接覆盖 release，方便在表单里改文案。

返回：

```json
{
  "release": { "...": "映射后的 release 对象" },
  "asset": { "name": "Turf.Launcher_0.2.1_x64-setup.exe", "size": 12345678, "url": "https://..." },
  "matched": true,
  "message": "已从 GitHub Releases 拉取 v0.2.1"
}
```

### GET /api/admin/github/releases?limit=20

返回最近的非 draft release 摘要：`{ "items": [{ "tag": "v0.2.1", "name": "...", "publishedAt": 0, "prerelease": false, "assets": [{ "name": "...", "size": 0, "url": "..." }] }] }`。
未配置 GitHub 仓库时返回 `400`。

### 公告

- `GET /api/admin/announcements` → `{ "items": [ ... ] }`
- `POST /api/admin/announcements` body `{ title, content, pinned, level, enabled, expiresAt }` → 201 公告对象
- `PUT /api/admin/announcements/:id`
- `DELETE /api/admin/announcements/:id`

公告对象：

```json
{
  "id": 1,
  "title": "更新公告",
  "content": "Markdown 文本",
  "pinned": true,
  "level": "info | warning | important",
  "enabled": true,
  "createdAt": 1762700000000,
  "expiresAt": 0
}
```

### 镜像节点

- `GET /api/admin/mirrors` → `{ "items": [ ... ] }`
- `POST /api/admin/mirrors` body `{ name, url, region, enabled, sortOrder }`
- `PUT /api/admin/mirrors/:id`
- `DELETE /api/admin/mirrors/:id`

镜像对象：

```json
{
  "id": 1,
  "name": "GitHub 官方",
  "url": "https://github.com/.../Turf.Launcher.exe",
  "scope": "update | game",
  "region": "global | cn | auto",
  "enabled": true,
  "sortOrder": 0,
  "createdAt": 1762700000000
}
```

`url` 必须是 `http(s)://` 绝对地址；`scope=update` 的节点会与 release 自带镜像合并去重，作为启动器更新下载的候选回退，`scope=game` 通过 `GET /api/v1/mirrors?scope=game` 单独下发。

### 设置

- `GET /api/admin/settings` → 设置对象；`github.token` 不回传，改为 `github.hasToken`。
- `PUT /api/admin/settings` → 保存；`github.token` 为空字符串表示不修改。

```json
{
  "siteName": "Turf Launcher 更新服务",
  "channel": "stable",
  "apiBase": "https://api.shenv.top",
  "github": {
    "repo": "shenwei322/turf-launcher-web",
    "hasToken": true,
    "assetPattern": "(?i)(setup\\.exe|\\.msi|\\.zip)$",
    "autoSync": true
  },
  "cronSecret": "dba25fe7f65b34dd105c17126ed33247"
}
```

`cronSecret` 对管理员返回明文，用于配置 GitHub Actions；`github.token` 永不回传。
`PUT` 时 `github.token` 为空字符串表示不修改，`clearToken: true` 清除；`regenerateCronSecret: true` 重新生成密钥。

## 3. 公开接口（启动器）

### GET /api/v1/update

查询参数：`current`（客户端版本）、`channel`（默认 stable）、`platform`（`windows`）、`arch`（`x86_64`）。

```json
{
  "hasUpdate": true,
  "current": "0.2.0",
  "version": "0.2.1",
  "title": "Turf Launcher 0.2.1",
  "notes": "## 更新内容\n- ...",
  "force": false,
  "channel": "stable",
  "publishedAt": 1762700000000,
  "releaseUrl": "https://github.com/...",
  "minSupported": "0.0.0",
  "packageType": "portable",
  "download": {
    "url": "https://github.com/.../Turf.Launcher.exe",
    "sha256": "",
    "size": 12345678,
    "mirrors": [
      { "name": "GitHub 官方", "url": "https://github.com/..." },
      { "name": "国内节点", "url": "https://cdn.example.com/..." }
    ]
  }
}
```

没有发布任何版本时返回 `404 { "error": "还没有发布任何版本" }`。
兼容旧路径 `GET /api/update/latest`，额外带 `mandatory` 与 `downloadUrl` 字段。

### GET /api/v1/announcements

只返回 `enabled=true` 且未过期的公告，置顶优先、时间倒序，最多 20 条：

```json
{ "items": [{ "id": 1, "title": "...", "content": "...", "pinned": true, "level": "info", "createdAt": 0, "expiresAt": 0 }] }
```

兼容旧路径 `GET /api/announcements`。

### GET /api/v1/mirrors

只返回启用的镜像节点，可选 `?scope=update|game` 过滤：
`{ "items": [{ "id": 1, "name": "...", "url": "...", "scope": "update", "region": "cn", "sortOrder": 0 }] }`。

### POST /api/v1/stats/launch

无请求体，返回 `{ "ok": true }`。兼容旧路径 `POST /api/stats/launch`。

### GET /api/health

`{ "ok": true, "service": "shenv-update", "time": 1762700000000 }`

## 4. 定时同步

### POST /api/cron/sync

请求头 `x-cron-secret: <settings.cronSecret 或 CRON_SECRET>`，或查询参数 `?token=`。
拉取 GitHub latest release 并直接应用为当前发布，返回 `{ "ok": true, "release": { ... } }`。
没配置 secret 返回 `503`，secret 不匹配返回 `401`。供 `.github/workflows/sync-release.yml` 调用。

## 5. 错误格式

任何失败均为 `{ "error": "中文可读信息" }`，HTTP 状态码 400/401/404/429/500/502/503。
