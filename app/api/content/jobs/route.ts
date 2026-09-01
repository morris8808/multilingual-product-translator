import { db } from "@/lib/db";
import {
  contentEntitySchema,
  contentTranslationJobSchema,
} from "@/lib/schemas/content";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const entity = contentEntitySchema.parse(
      new URL(request.url).searchParams.get("entity"),
    );
    const jobs = await db.translationJob.findMany({
      where: {
        job: {
          workspaceId: workspace.id,
          type: "CONTENT_TRANSLATION",
          payload: { path: ["entity"], equals: entity },
        },
      },
      include: {
        job: {
          include: { events: { orderBy: { createdAt: "desc" }, take: 10 } },
        },
        items: { orderBy: { id: "asc" }, take: 200 },
      },
      orderBy: { job: { createdAt: "desc" } },
      take: 20,
    });
    return Response.json(jobs);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "任务读取失败" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = contentTranslationJobSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const [records, model] = await Promise.all([
      db.contentRecord.findMany({
        where: {
          id: { in: input.recordIds },
          workspaceId: workspace.id,
          entityType: input.entity,
        },
      }),
      db.modelConnection.findFirst({
        where: {
          id: input.modelConnectionId,
          workspaceId: workspace.id,
          kind: "TEXT",
          enabled: true,
        },
      }),
    ]);
    if (!model)
      return Response.json({ error: "文本模型不可用" }, { status: 404 });
    const rows = records.flatMap((record) => {
      const data = record.data as Record<string, unknown>;
      return input.fields
        .map((field) => ({
          sourceId: record.id,
          field,
          sourceText: String(data[field] ?? ""),
        }))
        .filter((item) => item.sourceText.trim());
    });
    if (!rows.length)
      return Response.json(
        { error: "所选字段没有可翻译内容" },
        { status: 400 },
      );
    const base = await db.$transaction(async (tx) => {
      const job = await tx.job.create({
        data: {
          workspaceId: workspace.id,
          type: "CONTENT_TRANSLATION",
          status: "QUEUED",
          payload: {
            entity: input.entity,
            recordIds: input.recordIds,
            fields: input.fields,
            targetLanguages: input.targetLanguages,
            modelConnectionId: model.id,
          },
          totalItems: rows.length * input.targetLanguages.length,
          events: {
            create: {
              level: "INFO",
              message: `${input.entity} 翻译任务已排队：${rows.length} 个字段单元`,
            },
          },
        },
      });
      const translation = await tx.translationJob.create({
        data: {
          jobId: job.id,
          sourceLanguage: input.sourceLanguage,
          targetLanguages: input.targetLanguages,
          options: {
            entity: input.entity,
            modelConnectionId: model.id,
            fields: input.fields,
          },
        },
      });
      await tx.translationItem.createMany({
        data: rows.map((row) => ({ translationJobId: translation.id, ...row })),
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "CONTENT_TRANSLATION_CREATE",
          entityType: input.entity,
          entityId: job.id,
          detail: { total: job.totalItems },
        },
      });
      return job;
    });
    return Response.json(base, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "内容翻译任务创建失败",
      },
      { status: 400 },
    );
  }
}
