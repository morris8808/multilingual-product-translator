import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

const localContentType = (filePath: string) => {
  const extension = filePath.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "image/jpeg";
};
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const image = await db.imageAsset.findFirst({
      where: { id, product: { batch: { workspaceId: workspace.id } } },
      include: { product: { include: { batch: true } } },
    });
    if (!image) return new Response("Not found", { status: 404 });
    let source = image.sourceUrl;
    if (source.startsWith("/uploads/private/")) {
      const uploadRoot = path.join(process.cwd(), "public", "uploads", "private");
      const filePath = path.normalize(
        path.join(uploadRoot, source.replace(/^\/uploads\/private\//, "")),
      );
      if (!filePath.startsWith(uploadRoot))
        return new Response("Invalid image path", { status: 400 });
      const buffer = await readFile(filePath);
      return new Response(buffer, {
        headers: {
          "Content-Type": localContentType(filePath),
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }
    if (!/^https?:\/\//i.test(source)) {
      const marker = "FECIFY:";
      const siteId = image.product.batch.source.startsWith(marker)
        ? image.product.batch.source.slice(marker.length)
        : "";
      const site = siteId
        ? await db.siteConnection.findFirst({
            where: { id: siteId, workspaceId: workspace.id },
          })
        : null;
      if (!site) throw new Error("相对图片地址缺少对应站点");
      const capabilities = (site.capabilities || {}) as {
        baseImageUrl?: string;
      };
      const imageBase =
        capabilities.baseImageUrl || `${new URL(site.apiUrl).origin}/media`;
      source = new URL(
        source.replace(/^\//, ""),
        `${imageBase.replace(/\/$/, "")}/`,
      ).toString();
    }
    const origin = new URL(source).origin;
    const response = await fetch(source, {
      headers: {
        "User-Agent": "Mozilla/5.0 MultilingualWorkbench/1.0",
        Referer: `${origin}/`,
      },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`远端图片返回 HTTP ${response.status}`);
    return new Response(response.body, {
      headers: {
        "Content-Type": response.headers.get("content-type") || "image/jpeg",
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "图片读取失败" },
      { status: 502 },
    );
  }
}
