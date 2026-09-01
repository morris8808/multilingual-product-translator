import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; changeId: string }> },
) {
  try {
    const { id, changeId } = await params;
    const { workspace } = await getWorkspaceContext();
    const product = await db.productDraft.findFirst({
      where: { id, batch: { workspaceId: workspace.id } },
    });
    const change = await db.productChangeLog.findFirst({
      where: { id: changeId, productId: id },
    });
    if (!product || !change)
      return Response.json({ error: "商品或修改记录不存在" }, { status: 404 });
    if (!change.field)
      return Response.json({ error: "该记录不能撤销" }, { status: 400 });
    if (change.undoneAt)
      return Response.json({ error: "该修改已经撤销" }, { status: 409 });
    const data = product.data as Record<string, unknown>;
    const current = data[change.field];
    await db.$transaction(async (tx) => {
      await tx.productDraft.update({
        where: { id },
        data: {
          data: {
            ...data,
            [change.field!]: change.before,
          } as Prisma.InputJsonValue,
        },
      });
      await tx.productChangeLog.update({
        where: { id: change.id },
        data: { undoneAt: new Date() },
      });
      await tx.productChangeLog.create({
        data: {
          productId: id,
          action: "UNDO",
          field: change.field,
          before: JSON.parse(
            JSON.stringify(current ?? null),
          ) as Prisma.InputJsonValue,
          after: change.before ?? Prisma.JsonNull,
          detail: { revertedChangeId: change.id },
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "PRODUCT_CHANGE_UNDO",
          entityType: "ProductDraft",
          entityId: id,
          detail: { changeId, field: change.field },
        },
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "撤销失败" },
      { status: 400 },
    );
  }
}
