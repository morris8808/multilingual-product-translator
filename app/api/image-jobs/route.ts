import { db } from "@/lib/db";
import { imageJobSchema } from "@/lib/schemas/images";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(request: Request) {
  try {
    const input = imageJobSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const [count, model] = await Promise.all([
      db.imageAsset.count({ where: { id: { in: input.imageIds }, product: { batch: { workspaceId: workspace.id } } } }),
      db.modelConnection.findFirst({ where: { id: input.modelConnectionId, workspaceId: workspace.id, kind: "IMAGE", enabled: true } }),
    ]);
    if (count !== input.imageIds.length) throw new Error("包含无权访问或不存在的图片");
    if (!model) throw new Error("图片模型连接不可用");
    const job = await db.job.create({ data: {
      workspaceId: workspace.id, type: "IMAGE_GENERATE", status: "QUEUED",
      payload: input, totalItems: input.imageIds.length,
      events: { create: { level: "INFO", message: `图片任务已进入队列（${input.imageIds.length} 张）` } },
    }});
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图片任务创建失败" }, { status: 400 });
  }
}
