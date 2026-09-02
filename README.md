![Uploading image.png…]()


# 多语言商品工作台

面向独立站商品团队的商品整理、翻译、图片处理与内容发布平台。系统采用独立账号体系，任务由后台 Worker 持续执行，页面关闭不会中断。

## 主要能力

- XLSX / CSV 导入与独立站商品拉取
- 商品与规格表编辑、字段配置、质量检查及修改历史
- 多语言商品与内容翻译、术语库管理
- 商品图片 AI 优化、批量裁剪、尺寸调整及水印处理
- 原图与历史生成版本的独立选择、审核、归档和写回
- 文本模型、图片模型、对象存储及独立站 API 管理
- 本地用户名密码认证、用户角色和登录权限管理
- PostgreSQL 持久化任务、后台 Worker 与运行状态监控

## 技术栈

- Next.js 16、React 19、TypeScript、Tailwind CSS
- PostgreSQL、Prisma ORM
- Node.js 22、Sharp
- Docker Compose

## 本地开发

要求 Node.js 22 和 PostgreSQL 15+。

```bash
cp .env.example .env
npm ci
npx prisma migrate deploy
npm run dev -- -p 3001
```

另开终端启动任务 Worker：

```bash
npm run worker
```

访问 `http://localhost:3001`。全新数据库首次使用 `admin / admin` 登录，系统会强制创建新的系统管理员用户名和密码。

## 常用命令

```bash
npm run typecheck
npm run build
npx prisma migrate deploy
npm run worker
```

## 账号与权限

- 初始凭据仅在数据库中不存在本地账号时生效。
- 首次登录必须更换管理员用户名和密码，完成前无法访问工作台。
- 密码通过带随机盐的 scrypt 哈希保存，不保存明文。
- 系统角色包括普通用户、系统管理员和系统开发者。

## 部署

生产部署、升级、备份、回滚和宝塔维护说明见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

## 数据与安全

- `.env`、`.env.production` 不提交到 Git。
- API Token、模型密钥和存储密钥经过服务端加密后保存。
- `CREDENTIAL_ENCRYPTION_KEY` 一旦投入使用必须长期保管；更换会导致已有加密凭据无法解密。
- 生产环境应由宝塔或其他反向代理配置 HTTPS。
