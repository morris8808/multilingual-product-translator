# 本地运行指南（社媒模块）

## 服务地址

| 服务 | 地址 | 说明 |
|---|---|---|
| **Web 工作台** | **http://localhost:3001** | 登录后点左侧「社媒发布」 |
| PostgreSQL | localhost:5432 | mpt-postgres 容器 |

## 登录账号（本地测试）

| 用户名 | 密码 | 说明 |
|---|---|---|
| `boss` | `test123456` | 首个注册账号，DEVELOPER 角色 |

> 忘记密码：注册新账号会自动成为新开发者；如需重置 boss 密码可改数据库。

## 如何启动（新开终端）

```bash
cd multilingual-product-translator

# 1. 起数据库（若容器没跑）
docker start mpt-postgres

# 2. 起 Web（3001 端口）
npm run dev

# 3. 另开终端起 Worker（排期发布靠它）
node node_modules/tsx/dist/cli.mjs worker/index.ts
```

## 测试什么

### ① 添加频道（真实发帖，免开发者应用）
1. 打开 http://localhost:3001 → 用 boss/test123456 登录
2. 左侧「社媒发布」→ 右上「添加频道」
3. 选一个平台并填凭据：
   - **Bluesky**：`你的用户名:应用密码`（应用密码在 bsky.app → 设置 → App Passwords 生成）
   - **Mastodon**：`实例地址:访问令牌`（如 mastodon.social，令牌在实例偏好→开发→新建应用）
   - **Medium**：Integration Token（Medium 设置 → Security tokens）

### ② 发布内容
1. 选频道 → 写文案 → 选「立即发布」或「定时发布」
2. 提交后出现在「发布队列」
3. Worker 到点自动发布，成功后状态变「已发布」并附原文链接

### ③ 需要开发者应用才能连的平台
| 平台 | 需配置环境变量 |
|---|---|
| X | X_API_KEY / X_API_SECRET |
| LinkedIn | LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET |
| Facebook | FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET |

> 这些平台需先到各自开发者后台注册应用，把 key 加到 `.env` 后重启 dev。

## 常见问题

- **登录后打不开**：确认访问的是 **3001** 端口（不是 3000），并 Ctrl+Shift+R 强制刷新
- **Worker 没发帖**：确认 worker 终端在运行（能看到 `worker-xxx started` 日志）
- **改代码后页面没变化**：Next.js dev 热更新，刷新即可；若改 schema 需 `npx prisma migrate dev`
