import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import {
  getTrashedImportBatches,
  saveTrashedImportBatches,
} from "@/lib/import-batch-trash";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const batch = await db.importBatch.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!batch) return Response.json({ error: "批次不存在" }, { status: 404 });
  const items = await getTrashedImportBatches(workspace.id);
  if (!items.some((item) => item.id === id)) {
    await saveTrashedImportBatches(workspace.id, [
      { id, deletedAt: new Date().toISOString() },
      ...items,
    ]);
  }
  return Response.json({ ok: true, trashed: true });
}
