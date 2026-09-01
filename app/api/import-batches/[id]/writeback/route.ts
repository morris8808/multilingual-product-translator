import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { z } from "zod";
import {Prisma} from "@prisma/client";
const allowed = [
  "title",
  "sub_title",
  "spu",
  "body_html",
  "meta_title",
  "meta_keywords",
  "meta_description",
  "status",
  "virtual_sales_count",
  "vendor",
];
async function context(id: string) {
  const { workspace } = await getWorkspaceContext();
  const batch = await db.importBatch.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { products: { orderBy: { rowIndex: "asc" } } },
  });
  if (!batch?.source.startsWith("FECIFY:"))
    throw new Error("只有 JOFSHOP 商品批次可以同步");
  const changes = batch.products
    .filter((p) => p.sourceId)
    .map((p) => {
      const data = p.data as Record<string, unknown>,
        original = p.original as Record<string, unknown>;
      const fields = Object.fromEntries(
        allowed
          .filter(
            (key) =>
              data[key] != null &&
              data[key] !== "" &&
              JSON.stringify(data[key]) !== JSON.stringify(original[key]),
          )
          .map((key) => [key, data[key]]),
      );
      return { productId: p.id, sourceProductId: p.sourceId!, fields };
    })
    .filter((x) => Object.keys(x.fields).length);
  return { workspace, batch, changes };
}
export async function GET(
  _r: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const data = await context((await params).id);
    return Response.json({
      count: data.changes.length,
      fieldChanges: data.changes.reduce(
        (n, x) => n + Object.keys(x.fields).length,
        0,
      ),
      products: data.changes.slice(0, 20),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步预览失败" },
      { status: 400 },
    );
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    z.object({ confirm: z.literal(true) }).parse(await request.json());
    const data = await context((await params).id);
    if (!data.changes.length) throw new Error("没有可同步的字段变更");
    const active = await db.job.findFirst({
      where: {
        workspaceId: data.workspace.id,
        type: "PRODUCT_DRAFT_WRITEBACK",
        status: { in: ["QUEUED", "RUNNING", "RETRYING", "PAUSED"] },
        payload: { path: ["batchId"], equals: data.batch.id },
      },
    });
    if (active) return Response.json(active);
    const job = await db.job.create({
      data: {
        workspaceId: data.workspace.id,
        type: "PRODUCT_DRAFT_WRITEBACK",
        status: "QUEUED",
        payload: JSON.parse(JSON.stringify({ batchId: data.batch.id, items: data.changes })) as Prisma.InputJsonValue,
        totalItems: data.changes.length,
        events: {
          create: {
            level: "INFO",
            message: `${data.changes.length} 个商品处理结果已进入写回队列`,
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步任务创建失败" },
      { status: 400 },
    );
  }
}
