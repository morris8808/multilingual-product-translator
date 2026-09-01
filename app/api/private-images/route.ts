import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
const sheetExtensions = new Set(["xlsx", "xls", "csv"]);
const contentExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const splitLinks = (value: unknown) =>
  String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
const extensionOf = (name: string) =>
  name.split(/[?#]/)[0].split(".").pop()?.toLowerCase() || "";
const safeRemoteUrl = (raw: string) => {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "::1" ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
    throw new Error("不允许下载本机或内网地址");
  return url;
};
type ImportGroup = {
  title: string;
  sku: string;
  urls: string[];
  localSources: string[];
};

export async function POST(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const form = await request.formData();
    const incomingFiles = form
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    const uploadDir = path.join(process.cwd(), "public", "uploads", "private");
    await mkdir(uploadDir, { recursive: true });
    const now = new Date();
    const groups: ImportGroup[] = [];
    const directUrls = [...new Set(splitLinks(form.get("urls")))];
    if (directUrls.length)
      groups.push({
        title: `远程图片 ${now.toLocaleString("zh-CN")}`,
        sku: `REMOTE-${now.getTime()}`,
        urls: directUrls,
        localSources: [],
      });

    const localFiles = incomingFiles.filter(
      (file) =>
        imageExtensions.has(extensionOf(file.name)) &&
        file.type.startsWith("image/"),
    );
    if (localFiles.length) {
      const group: ImportGroup = {
        title: `本地图片 ${now.toLocaleString("zh-CN")}`,
        sku: `PRIVATE-${now.getTime()}`,
        urls: [],
        localSources: [],
      };
      for (const file of localFiles) {
        if (file.size > 25 * 1024 * 1024)
          throw new Error(`${file.name} 超过 25MB`);
        const extension = extensionOf(file.name);
        const name = `${randomUUID()}.${extension}`;
        await writeFile(
          path.join(uploadDir, name),
          Buffer.from(await file.arrayBuffer()),
        );
        group.localSources.push(`/uploads/private/${name}`);
      }
      groups.push(group);
    }

    for (const file of incomingFiles.filter((item) =>
      sheetExtensions.has(extensionOf(item.name)),
    )) {
      if (file.size > 20 * 1024 * 1024)
        throw new Error(`${file.name} 超过 20MB`);
      const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
        type: "buffer",
      });
      for (const sheetName of workbook.SheetNames) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          workbook.Sheets[sheetName],
          { defval: "" },
        );
        rows.forEach((row, rowIndex) => {
          const entries = Object.entries(row);
          const imageEntries = entries.filter(([header]) =>
            /image|img|图片|图像|主图|详情图/i.test(header),
          );
          const urls = [
            ...new Set(
              (imageEntries.length ? imageEntries : entries).flatMap(
                ([, value]) => splitLinks(value),
              ),
            ),
          ];
          if (!urls.length) return;
          const valueFor = (pattern: RegExp) =>
            entries.find(([header]) => pattern.test(header))?.[1];
          groups.push({
            title: String(
              valueFor(/^title$|商品.*名称|产品.*名称|标题/i) ||
                `${file.name} · ${sheetName} · 第 ${rowIndex + 2} 行`,
            ),
            sku: String(
              valueFor(/^sku$|货号|商品编码|产品编码/i) ||
                `SHEET-${now.getTime()}-${groups.length + 1}`,
            ),
            urls,
            localSources: [],
          });
        });
      }
    }

    const failures: Array<{ url: string; error: string }> = [];
    for (const group of groups) {
      for (const rawUrl of group.urls.slice(0, 500)) {
        try {
          const url = safeRemoteUrl(rawUrl);
          const response = await fetch(url, {
            redirect: "follow",
            signal: AbortSignal.timeout(30_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const contentType = (response.headers.get("content-type") || "")
            .split(";")[0]
            .toLowerCase();
          const extension =
            contentExtensions[contentType] || extensionOf(url.pathname);
          if (!imageExtensions.has(extension))
            throw new Error(
              `不支持的图片格式 ${contentType || extension || "未知"}`,
            );
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 25 * 1024 * 1024) throw new Error("图片超过 25MB");
          const name = `${randomUUID()}.${extension === "jpeg" ? "jpg" : extension}`;
          await writeFile(path.join(uploadDir, name), bytes);
          group.localSources.push(`/uploads/private/${name}`);
        } catch (error) {
          failures.push({
            url: rawUrl,
            error: error instanceof Error ? error.message : "下载失败",
          });
        }
      }
    }
    const acceptedGroups = groups.filter((group) => group.localSources.length);
    const imported = acceptedGroups.reduce(
      (sum, group) => sum + group.localSources.length,
      0,
    );
    if (!imported)
      throw new Error(
        failures[0]?.error || "没有识别到可导入的图片、表格图片地址或有效链接",
      );

    const batch = await db.importBatch.create({
      data: {
        workspaceId: workspace.id,
        name: `自有图片 ${now.toLocaleString("zh-CN")}`,
        source: "PRIVATE_IMAGES",
        headers: ["title", "sku", "images"],
      },
    });
    for (let rowIndex = 0; rowIndex < acceptedGroups.length; rowIndex++) {
      const group = acceptedGroups[rowIndex];
      const product = await db.productDraft.create({
        data: {
          batchId: batch.id,
          rowIndex,
          data: {
            title: group.title,
            sku: group.sku,
            images: group.localSources,
          } as Prisma.InputJsonValue,
          original: {
            title: group.title,
            sku: group.sku,
            images: group.localSources,
          } as Prisma.InputJsonValue,
        },
      });
      await db.imageAsset.createMany({
        data: group.localSources.map((sourceUrl, position) => ({
          productId: product.id,
          sourceUrl,
          position,
        })),
      });
    }
    return Response.json(
      {
        imported,
        products: acceptedGroups.length,
        rejected: failures.length,
        failures: failures.slice(0, 20),
        batchId: batch.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "自有图片导入失败" },
      { status: 400 },
    );
  }
}
