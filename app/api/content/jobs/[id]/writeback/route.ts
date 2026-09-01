import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { type FecifyContentEntity } from "@/lib/integrations/fecify";
import { writebackSchema } from "@/lib/schemas/review";
import { getWorkspaceContext } from "@/lib/workspace-context";

async function preview(id: string) {
  const { workspace } = await getWorkspaceContext();
  const translation = await db.translationJob.findFirst({
    where: {
      id,
      job: { workspaceId: workspace.id, type: "CONTENT_TRANSLATION" },
    },
    include: { items: true, contentWritebacks: true },
  });
  if (!translation) throw new Error("内容翻译任务不存在");
  const options = (translation.options || {}) as {
    entity?: FecifyContentEntity;
  };
  if (!options.entity) throw new Error("任务缺少内容类型");
  const recordIds = [
    ...new Set(translation.items.map((item) => item.sourceId).filter(Boolean)),
  ] as string[];
  const records = await db.contentRecord.findMany({
    where: { id: { in: recordIds }, workspaceId: workspace.id },
  });
  if (!records.length) throw new Error("找不到待写回内容");
  const site = await db.siteConnection.findFirst({
    where: { id: records[0].siteId, workspaceId: workspace.id },
  });
  if (!site) throw new Error("独立站连接不存在");
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  const items = records.map((record) => ({
    recordId: record.id,
    sourceId: record.sourceId,
    title: record.title,
    translations: languages.map((language) =>
      Object.fromEntries([
        ["lang_code", language],
        ...translation.items
          .filter((item) => item.sourceId === record.id)
          .map((item) => [
            item.field,
            String(
              (item.translations as Record<string, unknown> | null)?.[
                language
              ] ?? item.sourceText,
            ),
          ]),
      ]),
    ),
    written: translation.contentWritebacks.some(
      (entry) =>
        entry.sourceId === record.sourceId && entry.status === "COMPLETED",
    ),
  }));
  return { workspace, translation, entity: options.entity, site, items };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const data = await preview(id);
    return Response.json({
      entity: data.entity,
      site: { id: data.site.id, name: data.site.name },
      items: data.items,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "写回预览失败" },
      { status: 400 },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    writebackSchema.parse(await request.json());
    const { id } = await context.params;
    const data = await preview(id);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(data.items.map((item) => item.translations)))
      .digest("hex");
    const idempotencyKey = `CONTENT_WRITEBACK:${id}:${fingerprint}`;
    const existing = await db.job.findUnique({ where: { idempotencyKey } });
    if (existing) return Response.json(existing);
    const job = await db.job.create({
      data: {
        workspaceId: data.workspace.id,
        type: "CONTENT_WRITEBACK",
        status: "QUEUED",
        idempotencyKey,
        payload: { translationJobId: id },
        totalItems: data.items.length,
        events: {
          create: {
            level: "INFO",
            message: `${data.items.length} 条内容已进入后台写回队列`,
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "内容写回失败" },
      { status: 400 },
    );
  }
}
