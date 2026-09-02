import { db } from "@/lib/db";
import { DEFAULT_PROMOTION_ADS, type PromotionAd } from "@/lib/promotion-ads";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET(request: Request) {
  const { user, workspace } = await getWorkspaceContext();
  const setting = await db.workspaceSetting.findUnique({
    where: { workspaceId_key: { workspaceId: workspace.id, key: "promotionAds" } },
  });
  const configured = (setting?.value as { ads?: PromotionAd[] } | null)?.ads;
  const all = new URL(request.url).searchParams.get("all") === "1";
  if (all && !["ADMIN", "DEVELOPER"].includes(user.role))
    return Response.json({ error: "没有推广管理权限" }, { status: 403 });
  const source = Array.isArray(configured) ? configured : DEFAULT_PROMOTION_ADS;
  const ads = all ? source : source.filter((ad) => ad.enabled);
  return Response.json({ ads });
}

export async function PUT(request: Request) {
  try {
    const { user, workspace } = await getWorkspaceContext();
    if (!['ADMIN', 'DEVELOPER'].includes(user.role))
      return Response.json({ error: "仅管理员或开发者可以管理推广内容" }, { status: 403 });
    const input = (await request.json()) as { ads?: PromotionAd[] };
    if (!Array.isArray(input.ads) || input.ads.length > 12)
      throw new Error("推广内容数量应为 0 至 12 条");
    const ads = input.ads.map((ad, index) => {
      const url = String(ad.url || "").trim();
      if (!/^https?:\/\//i.test(url)) throw new Error(`第 ${index + 1} 条推广链接无效`);
      return {
        id: String(ad.id || `promotion-${Date.now()}-${index}`),
        type: ["CUSTOM", "NOTICE"].includes(ad.type) ? ad.type : "CUSTOM",
        badge: String(ad.badge || "推广专区").slice(0, 30),
        title: String(ad.title || "").trim().slice(0, 120),
        description: String(ad.description || "").trim().slice(0, 500),
        buttonLabel: String(ad.buttonLabel || "了解详情").slice(0, 30),
        url,
        enabled: ad.enabled !== false,
      } as PromotionAd;
    });
    if (ads.some((ad) => !ad.title || !ad.description)) throw new Error("推广标题和说明不能为空");
    await db.workspaceSetting.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: "promotionAds" } },
      update: { value: { ads } },
      create: { workspaceId: workspace.id, key: "promotionAds", value: { ads } },
    });
    return Response.json({ ads });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "推广内容保存失败" }, { status: 400 });
  }
}
