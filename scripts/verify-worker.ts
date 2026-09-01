import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function main() {
  const workspace = await db.workspace.findFirstOrThrow();
  const job = await db.job.create({ data: { workspaceId: workspace.id, type: "SYSTEM_TEST", status: "QUEUED", payload: { steps: 5, delayMs: 300 }, totalItems: 5, events: { create: { level: "INFO", message: "自动验收任务已排队" } } } });
  for (let i = 0; i < 30; i++) {
    await sleep(250);
    const current = await db.job.findUniqueOrThrow({ where: { id: job.id }, include: { events: true } });
    if (["COMPLETED", "FAILED"].includes(current.status)) {
      console.log(JSON.stringify({ id: current.id, status: current.status, completedItems: current.completedItems, totalItems: current.totalItems, eventCount: current.events.length, result: current.result }));
      if (current.status !== "COMPLETED" || current.completedItems !== current.totalItems) process.exitCode = 1;
      return;
    }
  }
  throw new Error("Worker 验收超时");
}
main().finally(() => db.$disconnect());
