import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { jobActionSchema } from "@/lib/schemas/jobs";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const job = await db.job.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
  });
  if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
  return Response.json(job);
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = jobActionSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const job = await db.job.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
    if (input.action === "rename") {
      return Response.json(
        await db.job.update({
          where: { id },
          data: {
            displayName: input.displayName,
            events: {
              create: {
                level: "INFO",
                message: `任务备注已改为：${input.displayName}`,
              },
            },
          },
        }),
      );
    }
    if (input.action === "retry") {
      if (
        !["FAILED", "CANCELLED", "PARTIALLY_COMPLETED", "COMPLETED"].includes(
          job.status,
        )
      )
        return Response.json(
          { error: "只有已结束或失败的任务可以重新执行" },
          { status: 409 },
        );
      if (job.type === "WORKSPACE_DATA_PURGE")
        return Response.json(
          { error: "高风险清理任务必须从个人中心重新完成双重确认" },
          { status: 403 },
        );
      const retried = await db.job.create({
        data: {
          workspaceId: job.workspaceId,
          type: job.type,
          status: "QUEUED",
          displayName: job.displayName
            ? `${job.displayName}（重新执行）`
            : null,
          payload: job.payload as Prisma.InputJsonValue,
          totalItems: job.totalItems,
          maxAttempts: job.maxAttempts,
          events: {
            create: { level: "INFO", message: `由任务 ${job.id} 重新执行` },
          },
        },
      });
      return Response.json(retried, { status: 201 });
    }
    const allowed =
      input.action === "pause"
        ? ["QUEUED", "RUNNING", "RETRYING"]
        : input.action === "cancel"
          ? ["QUEUED", "RUNNING", "RETRYING", "PAUSED", "REVIEW"]
          : ["PAUSED"];
    if (!allowed.includes(job.status))
      return Response.json(
        { error: `任务当前状态 ${job.status} 不允许执行此操作` },
        { status: 409 },
      );
    const status =
      input.action === "pause"
        ? "PAUSED"
        : input.action === "cancel"
          ? "CANCELLED"
          : "QUEUED";
    const updated = await db.job.update({
      where: { id },
      data: {
        status,
        availableAt: new Date(),
        workerId: null,
        lockedAt: null,
        events: {
          create: {
            level: "INFO",
            message: `任务已${input.action === "pause" ? "暂停" : input.action === "cancel" ? "取消" : "恢复"}`,
          },
        },
      },
    });
    return Response.json(updated);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "任务操作失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const job = await db.job.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!job) return Response.json({ error: "任务不存在" }, { status: 404 });
    if (job.status === "RUNNING")
      return Response.json({ error: "运行中的任务请先结束" }, { status: 409 });
    await db.job.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 400 },
    );
  }
}
