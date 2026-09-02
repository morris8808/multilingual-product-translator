import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { writebackSchema } from "@/lib/schemas/review";
import { getWorkspaceContext } from "@/lib/workspace-context";
async function context(id: string) {
  const { workspace } = await getWorkspaceContext();
  const translation = await db.translationJob.findFirst({
    where: { id, job: { workspaceId: workspace.id } },
    include: { items: true, writebackRecords: true, job: true },
  });
  if (!translation) throw new Error("翻译任务不存在");
  const options = (translation.options || {}) as { batchId?: string };
  const batch = options.batchId
    ? await db.importBatch.findFirst({
        where: { id: options.batchId, workspaceId: workspace.id },
      })
    : null;
  if (!batch?.source.startsWith("FECIFY:"))
    throw new Error("该任务不是独立站商品批次，不能写回");
  const site = await db.siteConnection.findFirst({
    where: {
      id: batch.source.slice("FECIFY:".length),
      workspaceId: workspace.id,
    },
  });
  if (!site) throw new Error("原始独立站连接不存在");
  const productIds = [
    ...new Set(translation.items.map((item) => item.sourceId).filter(Boolean)),
  ] as string[];
  const products = await db.productDraft.findMany({
    where: { id: { in: productIds }, batchId: batch.id },
  });
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  const payloads = products
    .filter((product) => product.sourceId)
    .map((product) => ({
      product,
      translations: languages.map(
        (language) =>
          Object.fromEntries([
            ...[["lang_code", language]],
            ...translation.items
              .filter((item) => item.sourceId === product.id)
              .map((item) => {
                const values =
                  item.translations &&
                  typeof item.translations === "object" &&
                  !Array.isArray(item.translations)
                    ? (item.translations as Record<string, unknown>)
                    : {};
                return [item.field, String(values[language] || "")];
              }),
          ]) as Record<string, string>,
      ),
    }));
  return { workspace, translation, site, payloads };
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const data = await context(id);
    if (data.translation.job.status !== "COMPLETED")
      throw new Error("请先完成全部译文审核，再提交独立站写回");
    return Response.json({
      site: { id: data.site.id, name: data.site.name },
      products: data.payloads.map(({ product, translations }) => ({
        productId: product.id,
        sourceProductId: product.sourceId,
        translations,
      })),
      previous: data.translation.writebackRecords.map((row) => ({
        productId: row.productId,
        status: row.status,
        error: row.error,
      })),
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
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    writebackSchema.parse(await request.json());
    const data = await context(id);
    if (data.translation.job.status !== "COMPLETED")
      throw new Error("请先完成全部译文审核，再提交独立站写回");
    const fingerprint = createHash("sha256")
      .update(JSON.stringify(data.payloads.map((item) => item.translations)))
      .digest("hex");
    const idempotencyKey = `PRODUCT_TRANSLATION_WRITEBACK:${id}:${fingerprint}`;
    const existing = await db.job.findUnique({ where: { idempotencyKey } });
    if (existing) return Response.json(existing);
    const job = await db.job.create({
      data: {
        workspaceId: data.workspace.id,
        type: "PRODUCT_TRANSLATION_WRITEBACK",
        status: "QUEUED",
        idempotencyKey,
        payload: { translationJobId: id },
        totalItems: data.payloads.length,
        events: {
          create: {
            level: "INFO",
            message: `${data.payloads.length} 个商品翻译已进入后台写回队列`,
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "写回失败" },
      { status: 400 },
    );
  }
}
