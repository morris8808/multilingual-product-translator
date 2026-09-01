import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { bulkReplaceSchema } from "@/lib/schemas/products";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = bulkReplaceSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const batch = await db.importBatch.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!batch)
      return Response.json({ error: "导入批次不存在" }, { status: 404 });
    const products = await db.productDraft.findMany({
      where: {
        batchId: id,
        ...(input.productIds?.length ? { id: { in: input.productIds } } : {}),
      },
    });
    const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern =
      input.mode === "regex"
        ? input.search
        : input.mode === "exact"
          ? `^${escaped}$`
          : escaped;
    const expression = new RegExp(pattern, input.caseSensitive ? "g" : "gi");
    let changed = 0;
    await db.$transaction(async (tx) => {
      for (const product of products) {
        const data = product.data as Record<string, unknown>;
        if (typeof data[input.field] !== "string") continue;
        const before = data[input.field] as string;
        const after = before.replace(expression, input.replacement);
        if (before === after) continue;
        await tx.productDraft.update({
          where: { id: product.id },
          data: {
            data: { ...data, [input.field]: after } as Prisma.InputJsonValue,
          },
        });
        await tx.productChangeLog.create({
          data: {
            productId: product.id,
            action: "BULK_REPLACE",
            field: input.field,
            before,
            after,
            detail: {
              search: input.search,
              replacement: input.replacement,
              mode: input.mode,
              caseSensitive: input.caseSensitive,
            },
          },
        });
        changed += 1;
      }
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "PRODUCT_BULK_REPLACE",
          entityType: "ImportBatch",
          entityId: id,
          detail: {
            field: input.field,
            search: input.search,
            replacement: input.replacement,
            mode: input.mode,
            caseSensitive: input.caseSensitive,
            changed,
          },
        },
      });
    });
    return Response.json({ changed });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "批量替换失败" },
      { status: 400 },
    );
  }
}
