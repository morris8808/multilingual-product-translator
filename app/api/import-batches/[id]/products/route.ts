import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
async function batchInWorkspace(id: string) {
  const { workspace } = await getWorkspaceContext();
  return db.importBatch.findFirst({ where: { id, workspaceId: workspace.id } });
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const batch = await batchInWorkspace(id);
  if (!batch)
    return Response.json({ error: "导入批次不存在" }, { status: 404 });
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(
    200,
    Math.max(5, Number(url.searchParams.get("pageSize") || 20)),
  );
  const productId = url.searchParams.get("productId") || "";
  const where = { batchId: id, ...(productId ? { id: productId } : {}) };
  if (url.searchParams.get("idsOnly") === "1") {
    const rows = await db.productDraft.findMany({
      where,
      orderBy: { rowIndex: "asc" },
      select: { id: true },
    });
    return Response.json({ ids: rows.map((row) => row.id), total: rows.length });
  }
  const [items, total] = await Promise.all([
    db.productDraft.findMany({
      where,
      orderBy: { rowIndex: "asc" },
      skip: productId ? 0 : (page - 1) * pageSize,
      take: productId ? 1 : pageSize,
    }),
    db.productDraft.count({ where }),
  ]);
  return Response.json({
    items,
    total,
    page,
    pageSize,
    headers: batch.headers,
    filteredProductId: productId || null,
  });
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const batch = await batchInWorkspace(id);
  if (!batch)
    return Response.json({ error: "导入批次不存在" }, { status: 404 });
  const last = await db.productDraft.aggregate({
    where: { batchId: id },
    _max: { rowIndex: true },
  });
  const headers = Array.isArray(batch.headers) ? batch.headers.map(String) : [];
  const data = Object.fromEntries(
    headers.map((key) => [key, ""]),
  ) as Prisma.InputJsonObject;
  const product = await db.productDraft.create({
    data: {
      batchId: id,
      rowIndex: (last._max.rowIndex ?? -1) + 1,
      data,
      original: data,
    },
  });
  return Response.json(product, { status: 201 });
}
