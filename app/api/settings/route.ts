import { getWorkspaceContext } from "@/lib/workspace-context";
import { db } from "@/lib/db";
import { preferenceSchema, workspaceBrandSchema } from "@/lib/schemas/settings";
import { DEFAULT_TRANSLATION_PROMPT } from "@/lib/translation-prompt";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user, workspace } = await getWorkspaceContext();
    const workerConcurrency = await db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: { workspaceId: workspace.id, key: "workerConcurrency" },
      },
    });
    const defaultImageModel = await db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: { workspaceId: workspace.id, key: "defaultImageModel" },
      },
    });
    const imagePreviewMaxWidth = await db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: {
          workspaceId: workspace.id,
          key: "imagePreviewMaxWidth",
        },
      },
    });
    const translationPrompt = await db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: { workspaceId: workspace.id, key: "translationPrompt" },
      },
    });
    return Response.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        role: user.role,
        authSource: user.authSource,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        subtitle: workspace.subtitle,
        logoUrl: workspace.logoUrl,
      },
      preferences: user.preferences,
      workerConcurrency:
        (workerConcurrency?.value as { value?: number } | null)?.value || 5,
      defaultImageModelId:
        (defaultImageModel?.value as { modelConnectionId?: string } | null)
          ?.modelConnectionId || "",
      imagePreviewMaxWidth:
        (imagePreviewMaxWidth?.value as { value?: number } | null)?.value ||
        860,
      translationPrompt:
        (translationPrompt?.value as { prompt?: string } | null)?.prompt ||
        DEFAULT_TRANSLATION_PROMPT,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "设置读取失败" },
      { status: 503 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const input = (await request.json()) as {
      section?: string;
      data?: unknown;
    };
    const { user, workspace } = await getWorkspaceContext();
    if (input.section === "preferences") {
      const data = preferenceSchema.parse(input.data);
      const preferences = await db.userPreference.upsert({
        where: { userId: user.id },
        update: data,
        create: { ...data, userId: user.id },
      });
      return Response.json({ preferences });
    }
    if (input.section === "workspace") {
      const data = workspaceBrandSchema.parse(input.data);
      const updated = await db.workspace.update({
        where: { id: workspace.id },
        data,
      });
      return Response.json({ workspace: updated });
    }
    if (input.section === "worker") {
      const concurrency = Math.min(
        20,
        Math.max(
          1,
          Number(
            (input.data as { workerConcurrency?: unknown } | undefined)
              ?.workerConcurrency || 5,
          ),
        ),
      );
      await db.workspaceSetting.upsert({
        where: {
          workspaceId_key: { workspaceId: workspace.id, key: "workerConcurrency" },
        },
        update: { value: { value: concurrency } },
        create: {
          workspaceId: workspace.id,
          key: "workerConcurrency",
          value: { value: concurrency },
        },
      });
      return Response.json({ workerConcurrency: concurrency });
    }
    if (input.section === "defaultImageModel") {
      const modelConnectionId = String(
        (input.data as { modelConnectionId?: unknown } | undefined)
          ?.modelConnectionId || "",
      );
      if (!modelConnectionId)
        return Response.json({ error: "请选择默认图片模型" }, { status: 400 });
      const model = await db.modelConnection.findFirst({
        where: {
          id: modelConnectionId,
          workspaceId: workspace.id,
          kind: "IMAGE",
          enabled: true,
        },
      });
      if (!model)
        return Response.json(
          { error: "默认图片模型不存在或未启用" },
          { status: 404 },
        );
      await db.workspaceSetting.upsert({
        where: {
          workspaceId_key: { workspaceId: workspace.id, key: "defaultImageModel" },
        },
        update: { value: { modelConnectionId } },
        create: {
          workspaceId: workspace.id,
          key: "defaultImageModel",
          value: { modelConnectionId },
        },
      });
      return Response.json({ defaultImageModelId: modelConnectionId });
    }
    if (input.section === "imagePreview") {
      const value = Math.min(
        1600,
        Math.max(
          360,
          Number(
            (input.data as { imagePreviewMaxWidth?: unknown } | undefined)
              ?.imagePreviewMaxWidth || 860,
          ),
        ),
      );
      await db.workspaceSetting.upsert({
        where: {
          workspaceId_key: {
            workspaceId: workspace.id,
            key: "imagePreviewMaxWidth",
          },
        },
        update: { value: { value } },
        create: {
          workspaceId: workspace.id,
          key: "imagePreviewMaxWidth",
          value: { value },
        },
      });
      return Response.json({ imagePreviewMaxWidth: value });
    }
    if (input.section === "translationPrompt") {
      const prompt = String(
        (input.data as { prompt?: unknown } | undefined)?.prompt || "",
      ).trim();
      if (prompt.length < 20)
        return Response.json(
          { error: "翻译提示词至少需要 20 个字" },
          { status: 400 },
        );
      if (prompt.length > 8000)
        return Response.json(
          { error: "翻译提示词不能超过 8000 个字" },
          { status: 400 },
        );
      await db.workspaceSetting.upsert({
        where: {
          workspaceId_key: { workspaceId: workspace.id, key: "translationPrompt" },
        },
        update: { value: { prompt } },
        create: {
          workspaceId: workspace.id,
          key: "translationPrompt",
          value: { prompt },
        },
      });
      return Response.json({ translationPrompt: prompt });
    }
    return Response.json({ error: "不支持的设置分区" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "设置保存失败" },
      { status: 400 },
    );
  }
}
