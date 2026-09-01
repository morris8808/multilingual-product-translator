import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { productPatchSchema } from "@/lib/schemas/products";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = productPatchSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const product = await db.productDraft.findFirst({
      where: { id, batch: { workspaceId: workspace.id } },
    });
    if (!product)
      return Response.json({ error: "商品草稿不存在" }, { status: 404 });
    const before = product.data as Record<string, unknown>;
    const changedFields = Object.keys(input.data).filter(
      (key) => JSON.stringify(before[key]) !== JSON.stringify(input.data[key]),
    );
    const data = JSON.parse(
      JSON.stringify(input.data),
    ) as Prisma.InputJsonValue;
    const updated = await db.$transaction(async (tx) => {
      const row = await tx.productDraft.update({
        where: { id },
        data: { data },
      });
      if (changedFields.length)
        await tx.productChangeLog.createMany({
          data: changedFields.map((field) => ({
            productId: id,
            action: "CELL_EDIT",
            field,
            before: JSON.parse(
              JSON.stringify(before[field] ?? null),
            ) as Prisma.InputJsonValue,
            after: JSON.parse(
              JSON.stringify(input.data[field] ?? null),
            ) as Prisma.InputJsonValue,
          })),
        });
      return row;
    });
    return Response.json(updated);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "商品保存失败" },
      { status: 400 },
    );
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const product = await db.productDraft.findFirst({
    where: { id, batch: { workspaceId: workspace.id } },
    include: { changes: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!product)
    return Response.json({ error: "商品草稿不存在" }, { status: 404 });
  return Response.json(product.changes);
}
