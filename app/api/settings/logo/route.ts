import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export async function POST(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const form = await request.formData();
    const file = form.get("logo");
    if (!(file instanceof File)) throw new Error("请选择 Logo 图片");
    const extension = extensions[file.type];
    if (!extension) throw new Error("Logo 仅支持 PNG、JPG、WebP、GIF、AVIF 或 SVG");
    if (file.size > 5 * 1024 * 1024) throw new Error("Logo 图片不能超过 5MB");
    const uploadDir = path.join(process.cwd(), "public", "uploads", "branding");
    await mkdir(uploadDir, { recursive: true });
    const filename = `${workspace.id}-${randomUUID()}.${extension}`;
    await writeFile(path.join(uploadDir, filename), Buffer.from(await file.arrayBuffer()));
    const logoUrl = `/uploads/branding/${filename}`;
    await db.workspace.update({ where: { id: workspace.id }, data: { logoUrl } });
    return Response.json({ logoUrl });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Logo 上传失败" },
      { status: 400 },
    );
  }
}
