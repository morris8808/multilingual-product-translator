import { db } from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { modelConnectionSchema } from "@/lib/schemas/settings";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspace } = await getWorkspaceContext();
    const rows = await db.modelConnection.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
    });
    return Response.json(
      rows.map(({ encryptedKey, ...item }) => ({
        ...item,
        hasApiKey: Boolean(encryptedKey),
      })),
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "模型连接读取失败" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = modelConnectionSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const current = data.id
      ? await db.modelConnection.findFirst({
          where: { id: data.id, workspaceId: workspace.id },
        })
      : null;
    if (data.id && !current)
      return Response.json({ error: "模型连接不存在" }, { status: 404 });
    const values = {
      kind: data.kind,
      provider: data.provider,
      name: data.name,
      apiBase: data.apiBase || null,
      model: data.model,
      capabilities: data.capabilities,
      enabled: data.enabled,
      encryptedKey: data.apiKey
        ? encryptCredential(data.apiKey.trim().replace(/[，,;；]+$/, ""))
        : current?.encryptedKey || null,
    };
    const row = current
      ? await db.modelConnection.update({
          where: { id: current.id },
          data: values,
        })
      : await db.modelConnection.create({
          data: { ...values, workspaceId: workspace.id },
        });
    const { encryptedKey, ...safe } = row;
    return Response.json({ ...safe, hasApiKey: Boolean(encryptedKey) });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "模型连接保存失败" },
      { status: 400 },
    );
  }
}
