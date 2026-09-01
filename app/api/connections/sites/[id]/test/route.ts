import { db } from "@/lib/db";
import { getFecifyLanguages } from "@/lib/integrations/fecify";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const site = await db.siteConnection.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!site)
      return Response.json({ error: "站点连接不存在" }, { status: 404 });
    const started = Date.now();
    const result = await getFecifyLanguages(site);
    return Response.json({
      ok: true,
      latencyMs: Date.now() - started,
      baseLanguage: result.baseLanguage,
      languages: result.languages.length,
      message: `连接成功，识别到 ${result.languages.length} 种语言`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "站点连接测试失败" },
      { status: 502 },
    );
  }
}
