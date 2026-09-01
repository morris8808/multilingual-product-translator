import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { translationJobInputSchema } from "@/lib/schemas/translation";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function GET() {
  const { workspace } = await getWorkspaceContext();
  const jobs = await db.translationJob.findMany({
    where: { job: { workspaceId: workspace.id } },
    include: {
      job: {
        include: { events: { orderBy: { createdAt: "desc" }, take: 10 } },
      },
      items: { orderBy: { id: "asc" }, take: 5000 },
    },
    orderBy: { job: { createdAt: "desc" } },
    take: 20,
  });
  return Response.json(jobs);
}
export async function POST(request: Request) {
  try {
    const input = translationJobInputSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const [batch, model] = await Promise.all([
      db.importBatch.findFirst({
        where: { id: input.batchId, workspaceId: workspace.id },
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
    if (!batch || !model)
      return Response.json(
        { error: "商品批次或文本模型不可用" },
        { status: 404 },
      );
    const products = await db.productDraft.findMany({
      where: {
        batchId: batch.id,
        ...(input.productIds?.length ? { id: { in: input.productIds } } : {}),
      },
      orderBy: { rowIndex: "asc" },
    });
    const savedMappings =
      batch.fieldMappings &&
      typeof batch.fieldMappings === "object" &&
      !Array.isArray(batch.fieldMappings)
        ? (batch.fieldMappings as Record<string, unknown>)
        : {};
    const fieldMappings = Object.fromEntries(
      input.fields.map((sourceField) => [
        sourceField,
        String(savedMappings[sourceField] || sourceField),
      ]),
    );
    const mappedTargets = Object.values(fieldMappings);
    if (new Set(mappedTargets).size !== mappedTargets.length)
      return Response.json(
        { error: "多个所选源字段映射到了同一个标准字段，请先调整字段映射" },
        { status: 400 },
      );
    const rows = products.flatMap((product) => {
      const data =
        product.data &&
        typeof product.data === "object" &&
        !Array.isArray(product.data)
          ? (product.data as Record<string, unknown>)
          : {};
      return input.fields
        .map((sourceField) => ({
          sourceId: product.id,
          field: fieldMappings[sourceField],
          sourceText: String(data[sourceField] ?? ""),
        }))
        .filter((item) => item.sourceText.trim());
    });
    if (!rows.length)
      return Response.json(
        { error: "选择的商品字段没有可翻译内容" },
        { status: 400 },
      );
    const total = rows.length * input.targetLanguages.length;
    const job = await db.$transaction(async (tx) => {
      const base = await tx.job.create({
        data: {
          workspaceId: workspace.id,
          type: "PRODUCT_TRANSLATION",
          status: "QUEUED",
          payload: {
            batchId: batch.id,
            modelConnectionId: model.id,
            fields: input.fields,
            fieldMappings,
            targetLanguages: input.targetLanguages,
          },
          totalItems: total,
          events: {
            create: {
              level: "INFO",
              message: `商品翻译任务已排队：${rows.length} 个字段单元`,
            },
          },
        },
      });
      const translation = await tx.translationJob.create({
        data: {
          jobId: base.id,
          sourceLanguage: input.sourceLanguage,
          targetLanguages: input.targetLanguages,
          options: {
            batchId: batch.id,
            modelConnectionId: model.id,
            fields: input.fields,
            fieldMappings,
          },
        },
      });
      for (let offset = 0; offset < rows.length; offset += 500)
        await tx.translationItem.createMany({
          data: rows
            .slice(offset, offset + 500)
            .map((row) => ({ translationJobId: translation.id, ...row })),
        });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "TRANSLATION_JOB_CREATE",
          entityType: "Job",
          entityId: base.id,
          detail: {
            batchId: batch.id,
            total,
            fields: input.fields,
            fieldMappings,
            targetLanguages: input.targetLanguages,
          },
        },
      });
      return base;
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "翻译任务创建失败" },
      { status: 400 },
    );
  }
}
