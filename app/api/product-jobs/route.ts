import { z } from "zod";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
const schema = z.object({
  batchId: z.string(),
  fieldId: z.string(),
  productIds: z.array(z.string()).max(10000).optional(),
  rangeStart: z.number().int().min(1).optional(),
  rangeEnd: z.number().int().min(1).optional(),
});
export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const [batch, field] = await Promise.all([
      db.importBatch.findFirst({
        where: { id: input.batchId, workspaceId: workspace.id },
        include: { _count: { select: { products: true } } },
      }),
      db.fieldDefinition.findFirst({
        where: { id: input.fieldId, workspaceId: workspace.id },
        include: { rule: true },
      }),
    ]);
    if (!batch || !field)
      return Response.json({ error: "批次或字段不存在" }, { status: 404 });
    if (!field.rule)
      return Response.json(
        { error: "请先为字段保存执行规则" },
        { status: 400 },
      );
    const config = field.rule.config as Record<string, unknown>;
    const template = String(
      field.rule.kind === "AI"
        ? config.prompt || ""
        : field.rule.kind === "TEMPLATE"
          ? config.template || ""
          : field.rule.kind === "FORMULA"
            ? config.formula || ""
            : "",
    );
    const referencedFields = [
      ...template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g),
    ].map((match) => match[1].trim());
    if (referencedFields.length) {
      const definitions = await db.fieldDefinition.findMany({
        where: { workspaceId: workspace.id },
        select: { key: true },
      });
      const headers = Array.isArray(batch.headers)
        ? batch.headers.map(String)
        : [];
      const allowed = new Set([
        ...headers,
        ...definitions.map((definition) => definition.key),
      ]);
      const unknown = [
        ...new Set(referencedFields.filter((key) => !allowed.has(key))),
      ];
      if (unknown.length)
        return Response.json(
          {
            error: `提示词引用了不存在的字段：${unknown.join("、")}。请从字段按钮中选择。`,
          },
          { status: 400 },
        );
    }
    let productIds = input.productIds;
    if (!productIds && input.rangeStart && input.rangeEnd) {
      if (input.rangeEnd < input.rangeStart)
        return Response.json(
          { error: "结束编号不能小于起始编号" },
          { status: 400 },
        );
      const rows = await db.productDraft.findMany({
        where: {
          batchId: batch.id,
          rowIndex: { gte: input.rangeStart - 1, lte: input.rangeEnd - 1 },
        },
        orderBy: { rowIndex: "asc" },
        select: { id: true },
      });
      productIds = rows.map((row) => row.id);
    }
    const job = await db.job.create({
      data: {
        workspaceId: workspace.id,
        type: "PRODUCT_FIELD_GENERATE",
        status: "QUEUED",
        payload: {
          batchId: batch.id,
          fieldId: field.id,
          productIds,
        },
        totalItems: productIds?.length || batch._count.products,
        events: {
          create: { level: "INFO", message: `字段任务已排队：${field.label}` },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "字段任务创建失败" },
      { status: 400 },
    );
  }
}
