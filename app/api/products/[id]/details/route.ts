import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getFecifyProduct } from "@/lib/integrations/fecify";
import { getWorkspaceContext } from "@/lib/workspace-context";
const list = (value: unknown) =>
  Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
const clean = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const product = await db.productDraft.findFirst({
      where: { id, batch: { workspaceId: workspace.id } },
      include: { batch: true },
    });
    if (
      !product ||
      !product.sourceId ||
      !product.batch.source.startsWith("FECIFY:")
    )
      return Response.json(
        { error: "该商品不是可拉取详情的独立站商品" },
        { status: 400 },
      );
    const site = await db.siteConnection.findFirst({
      where: {
        id: product.batch.source.slice("FECIFY:".length),
        workspaceId: workspace.id,
        platform: { in: ["fecify", "jofshop"] },
      },
    });
    if (!site)
      return Response.json(
        { error: "没有可用的独立站连接" },
        { status: 404 },
      );
    const detail = await getFecifyProduct(site, product.sourceId);
    const variants = list(
      detail.variants || detail.product_variants || detail.variant_list,
    );
    const images = list(
      detail.images || detail.product_images || detail.image_list,
    );
    const imageRows = [...new Map(images.map((item, index) => {
      const sourceUrl = String(item.url || item.src || item.image_url || "");
      return [sourceUrl, { sourceUrl, position: index }] as const;
    }).filter(([sourceUrl]) => sourceUrl)).values()];
    await db.$transaction(async (tx) => {
      await tx.variantDraft.deleteMany({ where: { productId: id } });
      if (variants.length)
        await tx.variantDraft.createMany({
          data: variants.map((item) => ({
            productId: id,
            sourceId: String(item.id || item.variant_id || "") || null,
            data: clean(item),
          })),
        });
      await tx.imageAsset.updateMany({ where: { productId: id }, data: { archived: true } });
      for (const image of imageRows)
        await tx.imageAsset.upsert({
          where: { productId_sourceUrl: { productId: id, sourceUrl: image.sourceUrl } },
          update: { position: image.position, archived: false },
          create: { productId: id, ...image },
        });
      await tx.productDraft.update({
        where: { id },
        data: {
          data: clean({
            ...(product.data &&
            typeof product.data === "object" &&
            !Array.isArray(product.data)
              ? product.data
              : {}),
            ...detail,
          }),
        },
      });
    });
    return Response.json({
      variants: variants.length,
      images: imageRows.length,
      detail,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "商品详情拉取失败" },
      { status: 502 },
    );
  }
}
