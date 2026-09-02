import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { listFecifyProducts } from "@/lib/integrations/fecify";
import { productImageRows } from "@/lib/product-images";
import { getWorkspaceContext } from "@/lib/workspace-context";
const schema = z.object({
  siteConnectionId: z.string(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
  title: z.string().trim().max(200).optional(),
});
const clean = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const site = await db.siteConnection.findFirst({
      where: { id: input.siteConnectionId, workspaceId: workspace.id },
    });
    if (!site)
      return Response.json({ error: "站点连接不存在" }, { status: 404 });
    const result = await listFecifyProducts(
      site,
      input.page,
      input.pageSize,
      input.title,
    );
    const rows = result.list || [];
    if (!rows.length)
      return Response.json({ error: "站点没有返回商品" }, { status: 404 });
    const headers = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );
    const batch = await db.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          workspaceId: workspace.id,
          name: `${site.name} 商品 ${new Date().toLocaleString("zh-CN")}`,
          source: `FECIFY:${site.id}`,
          headers,
        },
      });
      await tx.productDraft.createMany({
        data: rows.map((row, index) => ({
          batchId: created.id,
          sourceId:
            String(row.id || row.product_id || row.productId || "") || null,
          rowIndex: index,
          data: clean(row),
          original: clean(row),
        })),
      });
      const products = await tx.productDraft.findMany({
        where: { batchId: created.id },
        select: { id: true, rowIndex: true },
      });
      const productIdByRow = new Map(
        products.map((product) => [product.rowIndex, product.id]),
      );
      const imageAssets = rows.flatMap((row, rowIndex) => {
        const productId = productIdByRow.get(rowIndex);
        return productId
          ? productImageRows(row).map((image) => ({ productId, ...image }))
          : [];
      });
      if (imageAssets.length)
        await tx.imageAsset.createMany({
          data: imageAssets,
          skipDuplicates: true,
        });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "FECIFY_PRODUCT_IMPORT",
          entityType: "ImportBatch",
          entityId: created.id,
          detail: {
            siteConnectionId: site.id,
            rowCount: rows.length,
            page: input.page,
            imageCount: imageAssets.length,
          },
        },
      });
      return created;
    });
    return Response.json(
      {
        ...batch,
        rowCount: rows.length,
        imageCount: rows.reduce(
          (total, row) => total + productImageRows(row).length,
          0,
        ),
        total: result.total,
        totalPage: result.totalPage,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "独立站商品拉取失败" },
      { status: 502 },
    );
  }
}
