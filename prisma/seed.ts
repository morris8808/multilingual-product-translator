import { PrismaClient, ModelKind } from "@prisma/client";

const db = new PrismaClient();

const providers = [
  [ModelKind.TEXT, "ollama", "本机 Ollama", "本地 / 开源"],
  [ModelKind.TEXT, "openai", "OpenAI", "海外 / 闭源"],
  [ModelKind.TEXT, "deepseek", "DeepSeek", "国内 / 闭源"],
  [ModelKind.TEXT, "dashscope", "阿里云百炼", "国内 / 多模型"],
  [ModelKind.TEXT, "custom", "自定义兼容接口", "自定义"],
  [ModelKind.IMAGE, "qwen-image", "Qwen-Image", "国内 / 开源与托管"],
  [ModelKind.IMAGE, "seedream", "Seedream", "国内 / 闭源"],
  [ModelKind.IMAGE, "gpt-image", "OpenAI GPT Image", "海外 / 闭源"],
  [ModelKind.IMAGE, "flux", "Black Forest Labs FLUX", "海外 / 开源与闭源"],
  [ModelKind.IMAGE, "comfyui", "ComfyUI", "本地 / 开源"],
  [ModelKind.IMAGE, "custom", "自定义图片接口", "自定义"],
] as const;

async function main() {
  const user = await db.user.upsert({
    where: { email: "owner@local.multilingual-workbench" },
    update: {},
    create: { email: "owner@local.multilingual-workbench", name: "工作台管理员", preferences: { create: {} } },
    include: { memberships: true },
  });
  const workspace = user.memberships[0]
    ? await db.workspace.findUniqueOrThrow({ where: { id: user.memberships[0].workspaceId } })
    : await db.workspace.create({
        data: { name: "多语言工作台", subtitle: "TRANSLATION ADMIN", memberships: { create: { userId: user.id, role: "owner" } } },
      });
  await db.userPreference.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  await db.workspaceSetting.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: "jobDefaults" } },
    update: {},
    create: { workspaceId: workspace.id, key: "jobDefaults", value: { maxAttempts: 3, heartbeatSeconds: 10, staleAfterSeconds: 60 } },
  });
  for (const [kind, code, name, category] of providers) {
    await db.modelProvider.upsert({
      where: { workspaceId_kind_code: { workspaceId: workspace.id, kind, code } },
      update: { name, category },
      create: { workspaceId: workspace.id, kind, code, name, category, isCustom: code === "custom" },
    });
  }
}

main().finally(() => db.$disconnect());
