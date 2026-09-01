import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

const schema = z.object({
  imageIds: z.array(z.string()).min(1).max(200),
  confirm: z.literal(true),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const assets = await db.imageAsset.findMany({
      where: {
        id: { in: input.imageIds },
        product: { batch: { workspaceId: workspace.id } },
      },
      include: {
        product: {
          include: {
            batch: true,
            images: {
              include: { versions: true },
              orderBy: { position: "asc" },
            },
          },
        },
        versions: true,
      },
    });
    if (!assets.length) throw new Error("没有找到所选图片");
    const products = [
      ...new Map(
        assets.map((asset) => [asset.product.id, asset.product]),
      ).values(),
    ];
    const batches = new Set(products.map((product) => product.batchId));
    if (batches.size !== 1) throw new Error("一次只能同步同一导入批次的图片");
    const batch = products[0].batch;
    if (!batch.source.startsWith("FECIFY:"))
      throw new Error("这些图片不属于可写回的 JOFSHOP 批次");
    const selectedIds = new Set(input.imageIds);
    const items = products
      .map((product) => ({
        productId: product.id,
        sourceProductId: product.sourceId,
        fields: {
          images: product.images.map((image) => {
            const active = image.versions.find((version) => version.isActive);
            return selectedIds.has(image.id) && active
              ? active.url
              : image.sourceUrl;
          }),
        },
      }))
      .filter((item) => item.sourceProductId);
    if (!items.length) throw new Error("所选图片对应的商品没有独立站商品编号");
    const job = await db.job.create({
      data: {
        workspaceId: workspace.id,
        type: "PRODUCT_DRAFT_WRITEBACK",
        status: "QUEUED",
        displayName: "同步已采用图片到独立站",
        payload: JSON.parse(
          JSON.stringify({ batchId: batch.id, items, imageIds: input.imageIds }),
        ) as Prisma.InputJsonValue,
        totalItems: items.length,
        events: {
          create: {
            level: "INFO",
            message: `${items.length} 个商品的图片已进入同步队列`,
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步任务创建失败" },
      { status: 400 },
    );
  }
}
