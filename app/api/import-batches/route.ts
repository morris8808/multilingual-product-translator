import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getTrashedImportBatches } from "@/lib/import-batch-trash";
export const runtime = "nodejs";
export const maxDuration = 60;
const clean = (value: unknown) =>
  JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
const imageUrlPattern = /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif|avif)(?:[?#]\S*)?$/i;
const imageFieldPattern = /(^|[_\s-])(image|img|photo|picture)([_\s-]|$)|图片|主图|详情图|规格图/i;
const splitImageUrls = (value: unknown) =>
  String(value ?? "")
    .split(/[\s,，]+/)
    .map((item) => item.trim())
    .filter((item) => imageUrlPattern.test(item));
export async function GET() {
  const { workspace } = await getWorkspaceContext();
  const trashed = await getTrashedImportBatches(workspace.id);
  const batches = await db.importBatch.findMany({
    where: {
      workspaceId: workspace.id,
      id: { notIn: trashed.map((item) => item.id) },
    },
    include: { _count: { select: { products: true } } },
    orderBy: { createdAt: "desc" },
  });
  return Response.json(batches);
}
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    const importImages = form.get("importImages") === "true";
    const ignoreImagePrompt = form.get("ignoreImagePrompt") === "true";
    if (!(file instanceof File))
      return Response.json({ error: "请选择文件" }, { status: 400 });
    if (file.size > 20 * 1024 * 1024)
      return Response.json({ error: "文件不能超过 20MB" }, { status: 413 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name))
      return Response.json(
        { error: "仅支持 XLSX、XLS 和 CSV" },
        { status: 400 },
      );
    const buffer = await file.arrayBuffer();
    const workbook = file.name.toLowerCase().endsWith(".csv")
      ? XLSX.read(new TextDecoder("utf-8").decode(buffer).replace(/^\uFEFF/, ""), {
          type: "string",
          cellDates: true,
        })
      : XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet)
      return Response.json(
        { error: "文件中没有可读取的工作表" },
        { status: 400 },
      );
    const rows = XLSX.utils
      .sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false })
      .slice(0, 10000);
    if (!rows.length)
      return Response.json({ error: "文件没有数据行" }, { status: 400 });
    const headers = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row))),
    );
    const imageColumns = headers
      .map((header) => ({
        header,
        count: rows.filter((row) => splitImageUrls(row[header]).length).length,
      }))
      .filter((item) => item.count && imageFieldPattern.test(item.header))
      .sort((a, b) => b.count - a.count);
    if (imageColumns.length && !importImages && !ignoreImagePrompt) {
      return Response.json(
        {
          code: "IMAGE_LINKS_DETECTED",
          error: `检测到 ${imageColumns.length} 个图片链接字段。是否以附件模式导入，导入后可直接在商品图片工作台编辑处理？`,
          imageColumns,
        },
        { status: 409 },
      );
    }
    const { workspace } = await getWorkspaceContext();
    const batch = await db.$transaction(async (tx) => {
      const created = await tx.importBatch.create({
        data: {
          workspaceId: workspace.id,
          name: file.name,
          source: "FILE_UPLOAD",
          headers,
        },
      });
      for (let offset = 0; offset < rows.length; offset += 500) {
        const chunk = rows.slice(offset, offset + 500);
        const products = await Promise.all(
          chunk.map((row, index) =>
            tx.productDraft.create({
              data: {
                batchId: created.id,
                rowIndex: offset + index,
                data: clean(row),
                original: clean(row),
              },
            }),
          ),
        );
        if (importImages && imageColumns.length) {
          await tx.imageAsset.createMany({
            data: products.flatMap((product, index) => {
              const row = chunk[index];
              const urls = imageColumns.flatMap(({ header }) =>
                splitImageUrls(row[header]),
              );
              return Array.from(new Set(urls)).map((sourceUrl, position) => ({
                productId: product.id,
                sourceUrl,
                position,
              }));
            }),
            skipDuplicates: true,
          });
        }
      }
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          action: "PRODUCT_FILE_IMPORT",
          entityType: "ImportBatch",
          entityId: created.id,
          detail: {
            fileName: file.name,
            rowCount: rows.length,
            headers,
            imageColumns: imageColumns.map((item) => item.header),
            imageAttachmentMode: importImages,
          },
        },
      });
      return created;
    });
    return Response.json(
      {
        ...batch,
        rowCount: rows.length,
        imageAttachmentMode: importImages,
        imageColumns,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 400 },
    );
  }
}
