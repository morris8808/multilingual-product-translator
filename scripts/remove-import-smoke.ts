import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
db.importBatch
  .deleteMany({ where: { name: "product-import-smoke.csv", source: "FILE_UPLOAD" } })
  .then((result) => console.log(`removed ${result.count} smoke batch(es)`))
  .finally(() => db.$disconnect());
