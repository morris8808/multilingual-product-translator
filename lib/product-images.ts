import { db } from "@/lib/db";

type ImageRow = { sourceUrl: string; position: number };

export function productImageRows(data: unknown): ImageRow[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const record = data as Record<string, unknown>;
  const source = record.images || record.product_images || record.image_list;
  if (!Array.isArray(source)) return [];

  return [
    ...new Map(
      source
        .map((item, index) => {
          const sourceUrl =
            typeof item === "string"
              ? item
              : item && typeof item === "object"
                ? String(
                    (item as Record<string, unknown>).url ||
                      (item as Record<string, unknown>).src ||
                      (item as Record<string, unknown>).image_url ||
                      "",
                  )
                : "";
          return [sourceUrl, { sourceUrl, position: index }] as const;
        })
        .filter(([sourceUrl]) => /^https?:\/\//i.test(sourceUrl)),
    ).values(),
  ];
}

/** Repairs batches imported before image assets were materialized on import. */
export async function materializeWorkspaceProductImages(workspaceId: string) {
  const products = await db.productDraft.findMany({
    where: { batch: { workspaceId }, images: { none: {} } },
    select: { id: true, data: true },
    take: 500,
  });
  const rows = products.flatMap((product) =>
    productImageRows(product.data).map((image) => ({
      productId: product.id,
      ...image,
    })),
  );
  if (rows.length)
    await db.imageAsset.createMany({ data: rows, skipDuplicates: true });
  return rows.length;
}
