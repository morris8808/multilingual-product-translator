import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getTrashedImportBatches } from "@/lib/import-batch-trash";

const latestJobImageIds = (
  jobs: Array<{ payload: unknown; status: string }>,
  statuses: string[],
) => {
  const latestStatusByImageId = new Map<string, string>();
  for (const job of jobs) {
    const payload = job.payload as { imageIds?: unknown };
    if (!Array.isArray(payload.imageIds)) continue;
    for (const imageId of payload.imageIds.map(String)) {
      if (!latestStatusByImageId.has(imageId)) {
        latestStatusByImageId.set(imageId, job.status);
      }
    }
  }
  return Array.from(latestStatusByImageId.entries())
    .filter(([, status]) => statuses.includes(status))
    .map(([imageId]) => imageId);
};

export async function GET(request: Request) {
  const { workspace, user } = await getWorkspaceContext();
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const status = url.searchParams.get("status") || "all";
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const exclude = (url.searchParams.get("exclude") || "").trim().toLowerCase();
  const sort = url.searchParams.get("sort") || "product";
  const imageType = url.searchParams.get("imageType") || "all";
  const sourceMode = url.searchParams.get("sourceMode") || "store";
  const batchId = url.searchParams.get("batchId") || "";
  const productId = url.searchParams.get("productId") || "";
  const imageUrl = url.searchParams.get("imageUrl") || "";
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const pageSize = Math.min(
    60,
    Math.max(
      12,
      Number(
        url.searchParams.get("pageSize") ||
          user.preferences?.imagePageSize ||
          24,
      ),
    ),
  );
  const trashedBatches = await getTrashedImportBatches(workspace.id);
  const recentImageJobs = await db.job.findMany({
    where: {
      workspaceId: workspace.id,
      type: "IMAGE_GENERATE",
      status: { in: ["QUEUED", "RUNNING", "RETRYING", "PAUSED", "FAILED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 500,
    select: { payload: true, status: true },
  });
  const pendingImageIds = latestJobImageIds(recentImageJobs, [
    "QUEUED",
    "RUNNING",
    "RETRYING",
    "PAUSED",
  ]);
  const failedImageIds = latestJobImageIds(recentImageJobs, ["FAILED"]);
  const failedSyncJobs = await db.job.findMany({
    where: {
      workspaceId: workspace.id,
      type: "PRODUCT_DRAFT_WRITEBACK",
      status: "FAILED",
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: { payload: true },
  });
  const failedSyncImageIds = Array.from(
    new Set(
      failedSyncJobs.flatMap((job) => {
        const payload = job.payload as { imageIds?: unknown };
        return Array.isArray(payload.imageIds)
          ? payload.imageIds.map(String)
          : [];
      }),
    ),
  );
  let matchingProductIds: string[] | undefined;
  if (search || exclude) {
    const products = await db.productDraft.findMany({
      where: { batch: { workspaceId: workspace.id } },
      select: { id: true, data: true },
    });
    const includes = search.split(/[\s,，]+/).filter(Boolean);
    const excludes = exclude.split(/[\s,，]+/).filter(Boolean);
    matchingProductIds = products
      .filter((product) => {
        const text = JSON.stringify(product.data).toLowerCase();
        return (
          includes.every((term) => text.includes(term)) &&
          excludes.every((term) => !text.includes(term))
        );
      })
      .map((product) => product.id);
  }
  const imageExclusions = await db.workspaceSetting.findUnique({
    where: {
      workspaceId_key: {
        workspaceId: workspace.id,
        key: "excludedImageAssetIds",
      },
    },
  });
  const excludedImageIds = Array.isArray(
    (imageExclusions?.value as { ids?: unknown } | null)?.ids,
  )
    ? ((imageExclusions?.value as { ids?: unknown[] }).ids || []).map(String)
    : [];
  const idFilters: Prisma.ImageAssetWhereInput[] = [
    status === "excluded"
      ? { id: { in: excludedImageIds } }
      : { id: { notIn: excludedImageIds } },
  ];
  if (status === "processing") idFilters.push({ id: { in: pendingImageIds } });
  if (status === "failed") idFilters.push({ id: { in: failedImageIds } });
  if (status === "sync_failed")
    idFilters.push({ id: { in: failedSyncImageIds } });
  const where: Prisma.ImageAssetWhereInput = {
    archived: false,
    AND: idFilters,
    product: {
      batch: {
        workspaceId: workspace.id,
        id: {
          ...(batchId ? { equals: batchId } : {}),
          notIn: trashedBatches.map((item) => item.id),
        },
        ...(sourceMode === "store"
          ? { NOT: { source: "PRIVATE_IMAGES" } }
          : sourceMode === "private"
            ? { source: "PRIVATE_IMAGES" }
            : {}),
      },
      ...(matchingProductIds ? { id: { in: matchingProductIds } } : {}),
      ...(productId ? { id: productId } : {}),
    },
    ...(imageUrl ? { sourceUrl: imageUrl } : {}),
    ...(status === "adopted" ? { versions: { some: { isActive: true } } } : {}),
    ...(status === "unadopted"
      ? { versions: { none: { isActive: true } } }
      : {}),
    ...(status === "review"
      ? { versions: { some: { status: "REVIEW" } } }
      : {}),
    // 仅把已由图片任务产出的待审核/已采用版本视为“生成成功”。
    // 原图、归档记录或其它空版本不能被误显示为生成成功。
    ...(status === "success"
      ? { versions: { some: { status: { in: ["REVIEW", "APPROVED"] } } } }
      : {}),
    ...(status === "sync_success"
      ? { versions: { some: { syncedAt: { not: null } } } }
      : {}),
    ...(imageType === "product"
      ? { position: 0 }
      : imageType === "variant"
        ? { position: { gt: 0 } }
        : {}),
    ...(dateFrom || dateTo
      ? {
          updatedAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  };
  const orderBy: Prisma.ImageAssetOrderByWithRelationInput[] =
    sort === "recent"
      ? [{ updatedAt: "desc" }]
      : [{ productId: "asc" }, { position: "asc" }];
  const [
    images,
    models,
    total,
    sites,
    defaultImageModel,
    imagePreviewMaxWidth,
  ] = await Promise.all([
    db.imageAsset.findMany({
      where,
      include: {
        product: {
          select: {
            id: true,
            sourceId: true,
            batchId: true,
            data: true,
            batch: { select: { source: true } },
          },
        },
        versions: { orderBy: { createdAt: "desc" } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.modelConnection.findMany({
      where: { workspaceId: workspace.id, kind: "IMAGE", enabled: true },
      select: { id: true, name: true, provider: true, model: true },
      orderBy: { createdAt: "asc" },
    }),
    db.imageAsset.count({ where }),
    db.siteConnection.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, apiUrl: true },
    }),
    db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: "defaultImageModel",
        },
      },
    }),
    db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: "imagePreviewMaxWidth",
        },
      },
    }),
  ]);
  return Response.json({
    images: images.map((image) => {
      const data = image.product.data as Record<string, unknown>;
      const siteId = image.product.batch.source.startsWith("FECIFY:")
        ? image.product.batch.source.slice(7)
        : "";
      const site = sites.find((item) => item.id === siteId);
      let onlineUrl =
        data.online_url || data.product_url || data.url
          ? String(data.online_url || data.product_url || data.url)
          : "";
      if (!onlineUrl && site && data.handle)
        try {
          onlineUrl = `${new URL(site.apiUrl).origin}/products/${String(data.handle)}`;
        } catch {}
      return { ...image, onlineUrl };
    }),
    models,
    defaultImageModelId:
      (defaultImageModel?.value as { modelConnectionId?: string } | null)
        ?.modelConnectionId || "",
    pendingImageIds,
    excludedImageIds,
    preferences: {
      showOnlineProductLink: user.preferences?.showOnlineProductLink ?? true,
      imagePreviewMaxWidth:
        (imagePreviewMaxWidth?.value as { value?: number } | null)?.value ||
        860,
    },
    pagination: {
      page,
      pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  });
}
