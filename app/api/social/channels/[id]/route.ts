import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    await db.socialChannel.deleteMany({
      where: { id, workspaceId: workspace.id },
    });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "频道删除失败" },
      { status: 400 },
    );
  }
}
