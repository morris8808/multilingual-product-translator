import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { imageEditSchema } from "@/lib/schemas/image-edit";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const form = await request.formData();
    const operation = String(form.get("operation") || "");
    const targets = JSON.parse(String(form.get("targets") || "[]"));
    let watermarkUrl = String(form.get("watermarkUrl") || "");
    const watermark = form.get("watermark");
    if (operation === "WATERMARK_IMAGE" && watermark instanceof File) {
      if (watermark.type !== "image/png") throw new Error("水印图片必须是 PNG 格式");
      if (watermark.size > 10 * 1024 * 1024) throw new Error("水印图片不能超过 10MB");
      const directory = path.join(process.cwd(), "public", "uploads", "private", "watermarks");
      await mkdir(directory, { recursive: true });
      const name = `${randomUUID()}.png`;
      await writeFile(path.join(directory, name), Buffer.from(await watermark.arrayBuffer()));
      watermarkUrl = `/uploads/private/watermarks/${name}`;
    }
    const raw = Object.fromEntries(form.entries());
    const input = imageEditSchema.parse({ ...raw, operation, targets, watermarkUrl });
    const imageIds = [...new Set(input.targets.map((target) => target.imageId))];
    const count = await db.imageAsset.count({
      where: { id: { in: imageIds }, archived: false, product: { batch: { workspaceId: workspace.id } } },
    });
    if (count !== imageIds.length) throw new Error("包含无权访问、已归档或不存在的图片");
    const versionIds = input.targets.flatMap((target) => target.versionId ? [target.versionId] : []);
    if (versionIds.length) {
      const versionCount = await db.imageVersion.count({ where: { id: { in: versionIds }, image: { product: { batch: { workspaceId: workspace.id } } } } });
      if (versionCount !== new Set(versionIds).size) throw new Error("包含无权访问或不存在的历史版本");
      const versions = await db.imageVersion.findMany({ where: { id: { in: versionIds } }, select: { id: true, imageId: true } });
      const owner = new Map(versions.map((version) => [version.id, version.imageId]));
      if (input.targets.some((target) => target.versionId && owner.get(target.versionId) !== target.imageId)) throw new Error("历史版本与商品图片不匹配");
    }
    const job = await db.job.create({
      data: {
        workspaceId: workspace.id,
        type: "IMAGE_EDIT",
        status: "QUEUED",
        payload: { ...input, imageIds },
        totalItems: input.targets.length,
        events: { create: { level: "INFO", message: `批量图片编辑已进入队列（${input.targets.length} 个版本）` } },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "图片编辑任务创建失败" }, { status: 400 });
  }
}
