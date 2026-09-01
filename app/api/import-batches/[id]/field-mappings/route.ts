import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

const schema = z.object({
  mappings: z
    .record(z.string().min(1).max(120), z.string().min(1).max(120))
    .refine((value) => Object.keys(value).length <= 100),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const batch = await db.importBatch.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { fieldMappings: true },
  });
  if (!batch) return Response.json({ error: "批次不存在" }, { status: 404 });
  return Response.json({ mappings: batch.fieldMappings || {} });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = schema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const batch = await db.importBatch.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!batch) return Response.json({ error: "批次不存在" }, { status: 404 });
    const products = await db.productDraft.findMany({ where: { batchId: id } });
    const targets = [...new Set(Object.values(input.mappings))];
    await db.$transaction(async (tx) => {
      for (const product of products) {
        const data = product.data as Record<string, unknown>;
        const mapped = { ...data };
        for (const [source, target] of Object.entries(input.mappings)) {
          if (data[source] !== undefined && data[source] !== "")
            mapped[target] = data[source];
        }
        await tx.productDraft.update({
          where: { id: product.id },
          data: { data: mapped as Prisma.InputJsonValue },
        });
      }
      const headers = Array.isArray(batch.headers)
        ? batch.headers.map(String)
        : [];
      await tx.importBatch.update({
        where: { id },
        data: {
          fieldMappings: input.mappings,
          headers: [...new Set([...headers, ...targets])],
        },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "PRODUCT_FIELD_MAPPING",
          entityType: "ImportBatch",
          entityId: id,
          detail: { mappings: input.mappings, products: products.length },
        },
      });
    });
    return Response.json({ mapped: products.length, mappings: input.mappings });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "字段映射失败" },
      { status: 400 },
    );
  }
}
