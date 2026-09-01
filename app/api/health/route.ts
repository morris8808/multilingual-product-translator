import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
export const dynamic = "force-dynamic";
export async function GET() {
  const started = Date.now();
  try {
    const { workspace } = await getWorkspaceContext();
    await db.$queryRaw`SELECT 1`;
    const cutoff = new Date(Date.now() - 20_000);
    const [workers, failed, activeJobs, completed] = await Promise.all([
      db.workerRuntime.findMany({
        where: { status: "ONLINE", heartbeatAt: { gte: cutoff } },
        orderBy: { heartbeatAt: "desc" },
        take: 5,
      }),
      db.job.count({
        where: {
          workspaceId: workspace.id,
          status: "FAILED",
          updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      db.job.findMany({
        where: {
          workspaceId: workspace.id,
          status: { in: ["QUEUED", "RUNNING", "RETRYING"] },
        },
        select: { completedItems: true, totalItems: true },
      }),
      db.job.count({
        where: { workspaceId: workspace.id, status: "COMPLETED" },
      }),
    ]);
    const progress = activeJobs.length
      ? Math.round(
          (activeJobs.reduce((sum, job) => sum + job.completedItems, 0) /
            Math.max(
              1,
              activeJobs.reduce((sum, job) => sum + job.totalItems, 0),
            )) *
            100,
        )
      : 0;
    return Response.json({
      database: { online: true, latencyMs: Date.now() - started },
      worker: {
        online: workers.length > 0,
        count: workers.length,
        lastHeartbeat: workers[0]?.heartbeatAt || null,
        currentJobId: workers[0]?.currentJobId || null,
      },
      jobs: {
        running: activeJobs.length,
        completed,
        failed24h: failed,
        progress,
      },
      checkedAt: new Date(),
    });
  } catch (error) {
    return Response.json(
      {
        database: { online: false },
        worker: { online: false, count: 0 },
        jobs: { running: 0, completed: 0, failed24h: 0, progress: 0 },
        error: error instanceof Error ? error.message : "健康检查失败",
      },
      { status: 503 },
    );
  }
}
