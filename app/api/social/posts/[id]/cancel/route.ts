import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const post = await db.socialPost.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!post) return Response.json({ error: "帖子不存在" }, { status: 404 });
    if (post.status === "PUBLISHED")
      return Response.json({ error: "帖子已发布，无法取消" }, { status: 400 });
    await db.$transaction([
      db.socialPost.update({
        where: { id: post.id },
        data: { status: "CANCELLED" },
      }),
      db.job.updateMany({
        where: { id: post.jobId || "" },
        data: { status: "CANCELLED" },
      }),
    ]);
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "取消失败" },
      { status: 400 },
    );
  }
}
