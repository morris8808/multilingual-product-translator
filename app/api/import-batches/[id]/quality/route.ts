import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const batch = await db.importBatch.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { products: { orderBy: { rowIndex: "asc" }, take: 10000 } },
  });
  if (!batch)
    return Response.json({ error: "导入批次不存在" }, { status: 404 });
  const issues: Array<{
    productId: string;
    rowIndex: number;
    field: string;
    code: string;
    message: string;
    severity: "ERROR" | "WARNING";
  }> = [];
  const seen = new Map<string, string>();
  for (const product of batch.products) {
    const data = product.data as Record<string, unknown>;
    const title = String(data.title ?? data.name ?? "").trim();
    if (!title)
      issues.push({
        productId: product.id,
        rowIndex: product.rowIndex,
        field: "title",
        code: "EMPTY_TITLE",
        message: "标题为空",
        severity: "ERROR",
      });
    for (const key of ["handle", "spu", "sku"]) {
      const value = String(data[key] ?? "").trim();
      if (!value) continue;
      const signature = `${key}:${value.toLowerCase()}`;
      if (seen.has(signature))
        issues.push({
          productId: product.id,
          rowIndex: product.rowIndex,
          field: key,
          code: "DUPLICATE",
          message: `${key} 与其他商品重复`,
          severity: "ERROR",
        });
      else seen.set(signature, product.id);
    }
    for (const [field, value] of Object.entries(data)) {
      if (
        /url|link/i.test(field) &&
        typeof value === "string" &&
        value &&
        !/^https?:\/\//i.test(value)
      )
        issues.push({
          productId: product.id,
          rowIndex: product.rowIndex,
          field,
          code: "INVALID_URL",
          message: "URL 格式无效",
          severity: "WARNING",
        });
      if (
        /title/i.test(field) &&
        typeof value === "string" &&
        value.length > 160
      )
        issues.push({
          productId: product.id,
          rowIndex: product.rowIndex,
          field,
          code: "TOO_LONG",
          message: `标题长度 ${value.length}，建议不超过 160`,
          severity: "WARNING",
        });
      if (
        /body_html|description/i.test(field) &&
        typeof value === "string" &&
        /<script\b/i.test(value)
      )
        issues.push({
          productId: product.id,
          rowIndex: product.rowIndex,
          field,
          code: "UNSAFE_HTML",
          message: "包含 script 标签",
          severity: "ERROR",
        });
    }
  }
  return Response.json({
    checked: batch.products.length,
    issues,
    errors: issues.filter((item) => item.severity === "ERROR").length,
    warnings: issues.filter((item) => item.severity === "WARNING").length,
  });
}
