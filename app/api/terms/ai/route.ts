import { z } from "zod";
import { db } from "@/lib/db";
import { decryptCredential } from "@/lib/crypto";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { languageLabel } from "@/lib/languages";

const schema = z.object({
  source: z.string().trim().min(1).max(500),
  language: z.string().min(2).max(20),
  modelConnectionId: z.string().optional(),
});
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const model = await db.modelConnection.findFirst({
      where: {
        workspaceId: workspace.id,
        kind: "TEXT",
        enabled: true,
        ...(input.modelConnectionId ? { id: input.modelConnectionId } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    if (!model) throw new Error("请先在模型设置中启用文本模型");
    const base = (
      model.apiBase ||
      (model.provider === "ollama"
        ? "http://localhost:11434"
        : "https://api.openai.com/v1")
    ).replace(/\/$/, "");
    const prompt = `把术语“${input.source}”翻译成${languageLabel(input.language)}。只返回译文，不要解释。`;
    if (model.provider === "ollama") {
      const response = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model.model,
          stream: false,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = (await response.json()) as {
        message?: { content?: string };
        error?: string;
      };
      if (!response.ok) throw new Error(data.error || "AI 写入失败");
      return Response.json({ value: data.message?.content?.trim() || "" });
    }
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${model.encryptedKey ? decryptCredential(model.encryptedKey).trim() : ""}`,
      },
      body: JSON.stringify({
        model: model.model,
        temperature: 0.2,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(data.error?.message || "AI 写入失败");
    return Response.json({
      value: data.choices?.[0]?.message?.content?.trim() || "",
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "AI 写入失败" },
      { status: 400 },
    );
  }
}
