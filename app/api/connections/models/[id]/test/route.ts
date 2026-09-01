import { db } from "@/lib/db";
import { decryptCredential } from "@/lib/crypto";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const model = await db.modelConnection.findFirst({
      where: { id, workspaceId: workspace.id },
    });
    if (!model)
      return Response.json({ error: "模型连接不存在" }, { status: 404 });
    let base = (model.apiBase || "")
      .replace(/\/$/, "")
      .replace(/\/images\/generations$/, "");
    const url =
      model.provider === "ollama" ? `${base}/api/tags` : `${base}/models`;
    const started = Date.now();
    const response = await fetch(url, {
      headers: model.encryptedKey
        ? { Authorization: `Bearer ${decryptCredential(model.encryptedKey).trim().replace(/[，,;；]+$/, "")}` }
        : {},
      signal: AbortSignal.timeout(20_000),
    });
    const text = await response.text();
    if (!response.ok)
      throw new Error(
        `连接返回 HTTP ${response.status}：${text.slice(0, 160)}`,
      );
    return Response.json({
      ok: true,
      latencyMs: Date.now() - started,
      message: `连接成功，模型服务可访问（${Date.now() - started}ms）`,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "模型连接测试失败" },
      { status: 502 },
    );
  }
}
