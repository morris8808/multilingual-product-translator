# Production deployment

The production service is managed as a Docker Compose project and reuses the
PostgreSQL and Redis services installed by BT Panel.

```bash
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml run --rm web npx prisma migrate deploy
docker compose -f docker-compose.production.yml up -d
```

Runtime secrets belong in `.env.production` on the server and must not be
committed. Uploaded files persist in `data/uploads`.
