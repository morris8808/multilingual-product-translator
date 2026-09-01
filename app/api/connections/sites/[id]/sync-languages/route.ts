import { db } from "@/lib/db";
import { getFecifyLanguages } from "@/lib/integrations/fecify";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const { workspace } = await getWorkspaceContext();
    const site = await db.siteConnection.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!site)
      return Response.json({ error: "独立站连接不存在" }, { status: 404 });
    const result = await getFecifyLanguages(site);
    const enabledLanguages = result.languages
      .filter(
        (item) =>
          item.enabled &&
          item.code !== (result.baseLanguage || site.baseLanguage),
      )
      .map((item) => item.code);
    const updated = await db.siteConnection.update({
      where: { id: site.id },
      data: {
        baseLanguage: result.baseLanguage || site.baseLanguage,
        enabledLanguages,
        capabilities: { languages: result.languages },
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        action: "SITE_LANGUAGES_SYNC",
        entityType: "SiteConnection",
        entityId: site.id,
        detail: { baseLanguage: updated.baseLanguage, enabledLanguages },
      },
    });
    return Response.json({
      baseLanguage: updated.baseLanguage,
      enabledLanguages,
      languages: result.languages,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "站点语言同步失败" },
      { status: 400 },
    );
  }
}
