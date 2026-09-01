import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  if (
    !(await db.importBatch.findFirst({
      where: { id, workspaceId: workspace.id },
    }))
  )
    return Response.json({ error: "导入批次不存在" }, { status: 404 });
  const rows = await db.variantDraft.findMany({
    where: { product: { batchId: id } },
    include: {
      product: {
        select: { id: true, sourceId: true, rowIndex: true, data: true },
      },
    },
    orderBy: [{ product: { rowIndex: "asc" } }, { createdAt: "asc" }],
  });
  const headers = Array.from(
    new Set(
      rows.flatMap((row) =>
        row.data && typeof row.data === "object" && !Array.isArray(row.data)
          ? Object.keys(row.data as Record<string, unknown>)
          : [],
      ),
    ),
  );
  return Response.json({ rows, headers });
}
