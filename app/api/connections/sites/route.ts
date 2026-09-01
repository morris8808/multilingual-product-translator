import { db } from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { siteConnectionSchema } from "@/lib/schemas/settings";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspace } = await getWorkspaceContext();
    const rows = await db.siteConnection.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
    });
    return Response.json(
      rows.map(({ encryptedToken, ...item }) => ({
        ...item,
        hasToken: Boolean(encryptedToken),
      })),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "站点连接读取失败" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = siteConnectionSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const current = data.id
      ? await db.siteConnection.findFirst({
          where: { id: data.id, workspaceId: workspace.id },
        })
      : null;
    if (data.id && !current)
      return Response.json({ error: "站点连接不存在" }, { status: 404 });
    const values = {
      name: data.name,
      platform: data.platform,
      apiUrl: data.apiUrl,
      baseLanguage: data.baseLanguage || null,
      enabledLanguages: data.enabledLanguages,
      encryptedToken: data.token
        ? encryptCredential(data.token)
        : current?.encryptedToken || "",
    };
    const row = current
      ? await db.siteConnection.update({
          where: { id: current.id },
          data: values,
        })
      : await db.siteConnection.create({
          data: { ...values, workspaceId: workspace.id },
        });
    const { encryptedToken, ...safe } = row;
    return Response.json({ ...safe, hasToken: Boolean(encryptedToken) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "站点连接保存失败" },
      { status: 400 },
    );
  }
}
