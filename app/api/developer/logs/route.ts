import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(request: Request) {
  const { user, workspace } = await getWorkspaceContext();
  if (user.role !== "DEVELOPER" && user.role !== "ADMIN")
    return Response.json(
      { error: "仅管理员或开发者可以查看系统日志" },
      { status: 403 },
    );
  const { password } = (await request.json()) as { password?: string };
  if (!process.env.DEVELOPER_VIEW_PASSWORD)
    return Response.json(
      { error: "服务器尚未配置开发者查看密码" },
      { status: 503 },
    );
  if (password !== process.env.DEVELOPER_VIEW_PASSWORD)
    return Response.json({ error: "开发者密码错误" }, { status: 401 });
  const [jobs, audits] = await Promise.all([
    db.job.findMany({
      where: {
        workspaceId: workspace.id,
        status: { in: ["FAILED", "PARTIALLY_COMPLETED"] },
      },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
    db.auditLog.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return Response.json({ role: user.role, jobs, audits });
}
