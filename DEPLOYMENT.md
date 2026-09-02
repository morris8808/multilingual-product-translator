# 生产部署与运维

本文以宝塔面板、Docker Compose 和服务器已有 PostgreSQL 为基准。应用容器使用 host 网络连接宿主机数据库，Web 服务监听 `3001`。

## 目录规划

建议部署目录：

```text
/www/wwwroot/multilingual-product-translator/
├── docker-compose.production.yml
├── .env.production
├── data/uploads/
└── source code
```

## 环境变量

从 `.env.example` 创建 `.env.production`，生产值不得提交 Git。

```dotenv
DATABASE_URL=postgresql://workbench_user:强密码@127.0.0.1:5432/multilingual_workbench?schema=public
CREDENTIAL_ENCRYPTION_KEY=至少32字节的随机密钥
DEVELOPER_VIEW_PASSWORD=独立的开发者日志查看密码
```

Redis 当前不是运行必需项，不需要为本版本配置；后续接入分布式队列时再启用。

## 首次部署

```bash
git clone https://github.com/morris8808/multilingual-product-translator.git /www/wwwroot/multilingual-product-translator
cd /www/wwwroot/multilingual-product-translator
mkdir -p data/uploads
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm web npx prisma migrate deploy
docker compose -f docker-compose.production.yml up -d
docker compose -f docker-compose.production.yml ps
```

访问 `http://服务器IP:3001`，使用一次性账号 `admin / admin` 登录并立即创建正式管理员账号。

## 宝塔反向代理

1. 在“网站”中新增域名站点。
2. 配置反向代理到 `http://127.0.0.1:3001`。
3. 申请并开启 SSL，启用强制 HTTPS。
4. 上传类接口建议把请求体限制和超时适当调大。

推荐 Nginx 代理参数：

```nginx
client_max_body_size 100m;
proxy_connect_timeout 60s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

## 日常更新

```bash
cd /www/wwwroot/multilingual-product-translator
git pull --ff-only origin main
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm web npx prisma migrate deploy
docker compose -f docker-compose.production.yml up -d --remove-orphans
docker compose -f docker-compose.production.yml ps
```

## 健康检查与日志

```bash
curl -I http://127.0.0.1:3001/login
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=200 web
docker compose -f docker-compose.production.yml logs --tail=200 worker
```

## 备份

更新前至少备份数据库和上传目录：

```bash
pg_dump -Fc multilingual_workbench > /www/backup/multilingual_workbench-$(date +%F-%H%M).dump
tar -czf /www/backup/multilingual-uploads-$(date +%F-%H%M).tar.gz data/uploads
```

恢复前应先停止 Web 与 Worker，并确认备份文件有效。

## 回滚

1. 切换到上一个已验证 Git 提交。
2. 重新构建并启动容器。
3. Prisma 迁移默认只前进；涉及破坏性数据库回退时必须从部署前备份恢复。

## 故障排查

- Web 不健康：检查 `.env.production`、数据库连通性和 Web 日志。
- Worker 离线：检查 Worker 日志、数据库权限和容器重启次数。
- 登录循环：清除旧站点 Cookie，确认生产域名使用 HTTPS。
- 图片不可见：检查源站防盗链、上传目录挂载和对象存储公网地址。
