# 社媒排期模块融合设计（融入 multilingual-product-translator）

> 目标：把 Postiz 的社媒管理能力（频道连接 / 排期发布 / AI 创作）融入现有
> 多语言商品工作台，复用其 Next.js 16 + Prisma + Worker 队列体系，
> 不引入 Temporal / Redis / NestJS，保持单容器轻量部署。

## ✅ 实现状态（2026-09-04，本地验证通过）

| 里程碑 | 状态 |
|---|---|
| M1: schema + migration + 平台层接口 | ✅ 完成 |
| M2: API Routes + Worker SOCIAL_PUBLISH | ✅ 完成（失败重试 + 成功流转均实测） |
| M3: 前端 /social 页面 | ✅ 完成（HTTP 200，中文 UI） |
| M4: X / LinkedIn OAuth1/2 | ✅ 框架就绪（需老板提供开发者 key） |
| M5: Facebook / Instagram / TikTok / YouTube | 🔄 FB 已入框架，IG/TikTok/YT 待扩展 |

> 详见项目根目录 git 提交 b6dd857「feat: 社媒排期模块」。运行方式：
> `npm run dev`（默认 3000）+ `node node_modules/tsx/dist/cli.mjs worker/index.ts`

## 一、复用现有体系（零改造）

| 现有能力 | 复用方式 |
|---|---|
| `getWorkspaceContext()` | 社媒 API 全部走工作区隔离鉴权 |
| `encryptCredential()` | 频道 Token / RefreshToken 加密存储 |
| `Job` + `availableAt` 队列 | **排期发布**：到期自动被 Worker 领取执行（替代 Temporal） |
| Worker `claim()` + SKIP LOCKED | 无需新增轮询逻辑，注册新 job.type 即可 |
| `ModelConnection`（TEXT/IMAGE） | AI 文案生成（复用现有 callModel） |
| shadcn UI + platform-shell + i18n | 页面风格与导航完全一致 |

## 二、新增数据模型（prisma/schema.prisma）

```prisma
enum SocialPlatformKind {
  OAUTH1   // X
  OAUTH2   // LinkedIn / Facebook / Instagram / TikTok / YouTube
  TOKEN    // 填 token 的平台
}

model SocialChannel {
  id          String   @id @default(cuid())
  workspaceId String
  platform    String   // x / linkedin / facebook / instagram / tiktok / youtube / bluesky / mastodon / medium ...
  name        String   // 频道显示名（如页面名/用户名）
  profileId   String?  // 平台侧账号 ID
  username    String?  // 平台侧用户名/句柄
  picture     String?  // 头像 URL
  kind        String   // OAUTH1 / OAUTH2 / TOKEN
  encryptedAccessToken  String
  encryptedRefreshToken String?
  tokenExpiresAt DateTime?
  scope       String?
  metadata    Json?    // 页面列表等平台特有数据
  enabled     Boolean  @default(true)
  workspace   Workspace @relation(...)
  posts       SocialPost[]
  createdAt / updatedAt
  @@index([workspaceId, platform, enabled])
}

model SocialPost {
  id          String   @id @default(cuid())
  workspaceId String
  channelId   String
  content     String   // 帖子文本
  media       Json?    // [{url/本地路径}]
  scheduledAt DateTime? // 空 = 立即
  status      String   @default("DRAFT") // DRAFT/QUEUED/PUBLISHING/PUBLISHED/FAILED/CANCELLED
  jobId       String?  @unique  // 关联 Job 队列
  platformPostId String?  // 平台返回的帖子 ID
  releaseUrl  String?  // 发布后的链接
  error       String?
  workspace   Workspace @relation(...)
  channel     SocialChannel @relation(...)
  createdAt / updatedAt / publishedAt
  @@index([workspaceId, status, scheduledAt])
}
```

## 三、平台对接层（lib/integrations/social/）

统一接口，每个平台一个文件（fetch 直连，不引入重 SDK）：

```
interface SocialProvider {
  id: string; name: string; kind: 'OAUTH1'|'OAUTH2'|'TOKEN';
  connectUrl(workspace): string       // 授权跳转链接（OAuth）或"填 token"说明
  handleCallback(code, state): ChannelData  // OAuth 回调换 token
  publish(channel, content, media): { postId, url }
}
```

| 平台 | 方式 | 需要开发者应用 |
|---|---|---|
| X | OAuth1 (API Key/Secret) | 是 |
| LinkedIn | OAuth2 | 是 |
| Facebook / Instagram | OAuth2 (Meta App) | 是 |
| TikTok | OAuth2 | 是 |
| YouTube | OAuth2 (Google Cloud) | 是 |
| Bluesky | 账号密码 (app password) | 否 |
| Mastodon | 实例 + token | 否 |
| Medium | token | 否 |

> 第一版先实现 **OAUTH2 通用框架 + Bluesky/Mastodon/Medium（免开发者应用，
> 本地立即可连）+ X/LinkedIn 的 OAuth1/2 骨架**，其余平台按同一接口扩展。

## 四、后端 API Routes

```
POST /api/social/channels           创建（token 类）或发起 OAuth
POST /api/social/channels/:id/callback  OAuth 回调落地
GET  /api/social/channels           频道列表（脱敏）
POST /api/social/channels/:id/delete
POST /api/social/channels/:id/test  测试连接
POST /api/social/posts              新建帖子（立即发布 → 直接入队 availableAt=now）
GET  /api/social/posts              帖子列表（按状态/频道筛选）
POST /api/social/posts/:id/cancel
```

## 五、Worker 扩展

- 新增 `runSocialPublish(id)`：领到 Job 后读取 SocialPost →
  `provider.publish()` → 更新 status=PUBLISHED + platformPostId + releaseUrl
- 失败自动走现有 `fail()` 重试（maxAttempts）
- 分发注册：`else if (job.type === "SOCIAL_PUBLISH") await runSocialPublish(id);`

## 六、前端页面

- `/social` 社媒发布页（新导航项"社媒发布"，图标 Send/Share2）
  - 左侧：频道卡片列表 + "添加频道"（弹窗选平台 → OAuth 或填 token）
  - 中部：发帖编辑器（多频道勾选、文案、图片、AI 生成按钮——调用现有模型）
  - 右侧/下方：排期队列（草稿 / 已排期 / 已发布 / 失败），带取消/重试
- 全部中文，沿用 platform-shell / PageHeading / react-query 模式

## 七、里程碑

1. M1：schema + migration + 平台层接口 + Bluesky/Mastodon/Medium 可用
2. M2：API Routes + Worker SOCIAL_PUBLISH + 排期队列跑通
3. M3：前端 /social 页面（频道管理 + 编辑器 + 队列）
4. M4：X / LinkedIn OAuth1/2 接入（需要老板提供开发者应用 key）
5. M5：Facebook / Instagram / TikTok / YouTube（Meta/Google 开发者应用）
