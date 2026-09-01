import { db } from "@/lib/db";
import {
  getTrashedImportBatches,
  saveTrashedImportBatches,
} from "@/lib/import-batch-trash";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET() {
  const { workspace } = await getWorkspaceContext();
  const trashed = await getTrashedImportBatches(workspace.id);
  const batches = await db.importBatch.findMany({
    where: {
      workspaceId: workspace.id,
      id: { in: trashed.map((item) => item.id) },
    },
    include: { _count: { select: { products: true } } },
  });
  const byId = new Map(batches.map((batch) => [batch.id, batch]));
  return Response.json(
    trashed.flatMap((item) => {
      const batch = byId.get(item.id);
      return batch
        ? [{ ...item, name: batch.name, source: batch.source, count: batch._count.products }]
        : [];
    }),
  );
}

export async function POST(request: Request) {
  const { workspace } = await getWorkspaceContext();
  const body = (await request.json()) as { id?: unknown; action?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id || !["restore", "delete"].includes(String(body.action))) {
    return Response.json({ error: "回收站操作无效" }, { status: 400 });
  }
  const items = await getTrashedImportBatches(workspace.id);
  if (!items.some((item) => item.id === id)) {
    return Response.json({ error: "回收站中不存在该批次" }, { status: 404 });
  }
  if (body.action === "delete") {
    const batch = await db.importBatch.findFirst({
      where: { id, workspaceId: workspace.id },
      select: { id: true },
    });
    if (batch) await db.importBatch.delete({ where: { id } });
  }
  await saveTrashedImportBatches(
    workspace.id,
    items.filter((item) => item.id !== id),
  );
  return Response.json({ ok: true });
}
