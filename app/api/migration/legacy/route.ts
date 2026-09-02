import { Prisma } from "@prisma/client";
import { encryptCredential } from "@/lib/crypto";
import { db } from "@/lib/db";
import { legacyMigrationSchema } from "@/lib/schemas/migration";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
const text = (value: unknown) => typeof value === "string" ? value : "";
const records = (snapshot?: Record<string, unknown>) => {
  if (!snapshot) return [];
  for (const key of ["rows", "products", "data", "items"]) if (Array.isArray(snapshot[key])) return snapshot[key] as Record<string, unknown>[];
  return [];
};

export async function POST(request: Request) {
  try {
    const input = legacyMigrationSchema.parse(await request.json());
    const { user, workspace } = await getWorkspaceContext();
    const existing = await db.migrationLog.findUnique({ where: { migrationKey: input.migrationKey } });
    if (existing) return Response.json({ duplicate: true, summary: existing.summary });
    const summary = await db.$transaction(async (tx) => {
      if (input.preferences) await tx.userPreference.update({ where: { userId: user.id }, data: input.preferences });
      let sites = 0, models = 0, fields = 0, terms = 0, products = 0, translationItems = 0;
      if (input.site && text(input.site.apiUrl || input.site.url)) {
        const token = text(input.site.token || input.site.apiToken);
        await tx.siteConnection.create({ data: { workspaceId: workspace.id, name: text(input.site.name) || "迁移的独立站", platform: "jofshop", apiUrl: text(input.site.apiUrl || input.site.url), encryptedToken: encryptCredential(token), baseLanguage: text(input.site.baseLanguage) || null, enabledLanguages: (input.site.enabledLanguages || []) as Prisma.InputJsonValue } }); sites++;
      }
      for (const [kind, item] of [["TEXT", input.textModel], ["IMAGE", input.imageModel]] as const) if (item && text(item.model)) {
        const secret = text(item.apiKey || item.key);
        await tx.modelConnection.create({ data: { workspaceId: workspace.id, kind, provider: text(item.provider) || (kind === "TEXT" ? "openai" : "custom"), name: text(item.name) || `迁移的${kind === "TEXT" ? "文本" : "图片"}模型`, apiBase: text(item.apiBase || item.baseUrl) || null, encryptedKey: secret ? encryptCredential(secret) : null, model: text(item.model), capabilities: (item.capabilities || []) as Prisma.InputJsonValue } }); models++;
      }
      for (const [key, config] of Object.entries(input.fieldRules || {})) {
        const definition = await tx.fieldDefinition.upsert({ where: { workspaceId_key: { workspaceId: workspace.id, key } }, update: {}, create: { workspaceId: workspace.id, key, label: key, type: "TEXT" } });
        await tx.fieldRule.upsert({ where: { fieldDefinitionId: definition.id }, update: { config: config as Prisma.InputJsonValue }, create: { fieldDefinitionId: definition.id, kind: text((config as Record<string, unknown>)?.type) || "LEGACY", config: config as Prisma.InputJsonValue } }); fields++;
      }
      for (const item of input.terms) {
        const term = await tx.term.upsert({ where: { workspaceId_source: { workspaceId: workspace.id, source: item.source } }, update: { mode: item.rule.toUpperCase(), note: item.category }, create: { workspaceId: workspace.id, source: item.source, mode: item.rule.toUpperCase(), note: item.category, migrationKey: item.id ? `legacy-term:${item.id}` : null } });
        for (const [language, value] of Object.entries(item.translations)) await tx.termTranslation.upsert({ where: { termId_language: { termId: term.id, language } }, update: { value }, create: { termId: term.id, language, value } }); terms++;
      }
      const productRows = records(input.prepareTask);
      if (input.prepareTask) { const batch = await tx.importBatch.create({ data: { workspaceId: workspace.id, name: "旧商品处理任务", source: "LEGACY_INDEXEDDB", headers: Object.keys(productRows[0] || {}), migrationKey: `${input.migrationKey}:prepare` } }); for (let i=0;i<productRows.length;i++) await tx.productDraft.create({ data: { batchId: batch.id, rowIndex: i, data: productRows[i] as Prisma.InputJsonValue, original: productRows[i] as Prisma.InputJsonValue } }); products = productRows.length; }
      const translationRows = records(input.translationTask);
      if (input.translationTask) { const job = await tx.job.create({ data: { workspaceId: workspace.id, type: "LEGACY_TRANSLATION", status: "PAUSED", payload: input.translationTask as Prisma.InputJsonValue, totalItems: translationRows.length, idempotencyKey: `${input.migrationKey}:translation` } }); const tj = await tx.translationJob.create({ data: { jobId: job.id, sourceLanguage: text(input.translationTask.sourceLanguage) || "auto", targetLanguages: (input.translationTask.languages || input.translationTask.targetLanguages || []) as Prisma.InputJsonValue, migrationKey: `${input.migrationKey}:translation-detail` } }); for (const row of translationRows) await tx.translationItem.create({ data: { translationJobId: tj.id, sourceId: text(row.id) || null, field: "legacy", sourceText: JSON.stringify(row), translations: row as Prisma.InputJsonValue } }); translationItems = translationRows.length; }
      const result = { preferences: input.preferences ? 1 : 0, sites, models, fields, terms, products, translationItems };
      await tx.migrationLog.create({ data: { workspaceId: workspace.id, userId: user.id, migrationKey: input.migrationKey, source: "LEGACY_BROWSER", summary: result, status: "COMPLETED", completedAt: new Date() } });
      await tx.auditLog.create({ data: { workspaceId: workspace.id, action: "LEGACY_BROWSER_MIGRATION", entityType: "MigrationLog", detail: result } });
      return result;
    });
    return Response.json({ duplicate: false, summary });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "迁移失败" }, { status: 400 }); }
}
