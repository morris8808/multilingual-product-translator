import { db } from "@/lib/db";
import { imageArchiveSchema } from "@/lib/schemas/images";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function POST(request: Request) {
  try {
    const input = imageArchiveSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const setting = await db.workspaceSetting.findUnique({
      where: {
        workspaceId_key: { workspaceId: workspace.id, key: "imageArchive" },
      },
    });
    const policy = (setting?.value || {}) as {
      target?: string;
      storageConnectionId?: string;
    };
    if (policy.target !== "OWN" || !policy.storageConnectionId)
      throw new Error("请先在存储归档中启用自有存储桶");
    const [assets, storage] = await Promise.all([
      db.imageAsset.findMany({
        where: {
          id: { in: input.imageIds },
          archived: false,
          product: { batch: { workspaceId: workspace.id } },
        },
        include: { versions: { where: { isActive: true }, take: 1 } },
      }),
      db.storageConnection.findFirst({
        where: {
          id: policy.storageConnectionId,
          workspaceId: workspace.id,
          enabled: true,
        },
      }),
    ]);
    if (assets.length !== input.imageIds.length)
      throw new Error("部分图片不存在或已归档");
    if (
      input.mode === "adopted" &&
      assets.some((asset) => !asset.versions.length)
    )
      throw new Error("部分所选图片还没有已采用版本，请先确认采用");
    if (!storage) throw new Error("归档存储连接不可用");
    const job = await db.job.create({
      data: {
        workspaceId: workspace.id,
        type: "IMAGE_ARCHIVE",
        status: "QUEUED",
        displayName:
          input.mode === "adopted" ? "归档已采用图片" : "归档远端原图",
        payload: {
          imageIds: input.imageIds,
          storageConnectionId: storage.id,
          mode: input.mode,
        },
        totalItems: input.imageIds.length,
        events: {
          create: {
            level: "INFO",
            message: `${input.imageIds.length} 张${input.mode === "adopted" ? "已采用图片" : "原图"}已进入归档队列`,
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "归档任务创建失败" },
      { status: 400 },
    );
  }
}
