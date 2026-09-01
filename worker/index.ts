import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { hostname } from "node:os";
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Prisma, PrismaClient, JobStatus } from "@prisma/client";
import { decryptCredential } from "../lib/crypto";
import { DEFAULT_TRANSLATION_PROMPT } from "../lib/translation-prompt";
const db = new PrismaClient();
const workerId = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
let stopping = false;
let currentJobId: string | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const localUploadRoot = () =>
  path.resolve(process.cwd(), "public", "uploads", "private");
const localImageContentType = (filePath: string) => {
  const extension = filePath.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  return "image/jpeg";
};
async function readPrivateUpload(sourceUrl: string) {
  if (!sourceUrl.startsWith("/uploads/private/")) return null;
  const relative = decodeURIComponent(sourceUrl.split(/[?#]/)[0]).replace(
    /^\/uploads\/private\//,
    "",
  );
  const root = localUploadRoot();
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`))
    throw new Error("本地图片路径不安全");
  const bytes = await readFile(target);
  return {
    bytes,
    contentType: localImageContentType(target),
  };
}
async function recoverStale() {
  const cutoff = new Date(Date.now() - 60_000);
  await db.job.updateMany({
    where: {
      status: { in: ["RUNNING", "RETRYING"] },
      heartbeatAt: { lt: cutoff },
    },
    data: {
      status: "RETRYING",
      workerId: null,
      lockedAt: null,
      availableAt: new Date(),
    },
  });
}
async function claim() {
  const rows = await db.$queryRaw<
    Array<{ id: string }>
  >`WITH candidate AS (SELECT id FROM "Job" WHERE status IN ('QUEUED','RETRYING') AND "availableAt" <= NOW() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) UPDATE "Job" j SET status='RUNNING', "workerId"=${workerId}, "lockedAt"=NOW(), "heartbeatAt"=NOW(), "startedAt"=COALESCE(j."startedAt",NOW()), attempt=j.attempt+1 FROM candidate WHERE j.id=candidate.id RETURNING j.id`;
  return rows[0]?.id;
}
async function workerConcurrency() {
  const setting = await db.workspaceSetting.findFirst({
    where: { key: "workerConcurrency" },
    orderBy: { updatedAt: "desc" },
    select: { value: true },
  });
  const value = Number((setting?.value as { value?: unknown } | null)?.value);
  return Math.min(20, Math.max(1, Number.isFinite(value) ? value : 5));
}
async function event(
  jobId: string,
  message: string,
  detail?: object,
  level = "INFO",
) {
  await db.jobEvent.create({ data: { jobId, message, level, detail } });
}
async function runSystemTest(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as { steps?: number; delayMs?: number };
  const total = payload.steps || 10,
    delay = payload.delayMs || 1000;
  await event(id, `Worker ${workerId} 已领取任务`);
  for (let index = job.completedItems; index < total; index++) {
    await wait(delay);
    const current = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      current.status === JobStatus.PAUSED ||
      current.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        current.status === JobStatus.PAUSED
          ? "Worker 已安全暂停"
          : "Worker 已安全取消",
      );
      return;
    }
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        heartbeatAt: new Date(),
        completedItems: completed,
        etaSeconds: Math.ceil(((total - completed) * delay) / 1000),
        events: {
          create: {
            level: "INFO",
            message: `系统测试步骤 ${completed}/${total}`,
            detail: { completed, total, workerId },
          },
        },
      },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      result: { ok: true, workerId },
      finishedAt: new Date(),
      heartbeatAt: new Date(),
      etaSeconds: 0,
      events: { create: { level: "INFO", message: "SYSTEM_TEST 已完成" } },
    },
  });
}
function interpolate(template: string, data: Record<string, unknown>) {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key: string) =>
    String(data[key.trim()] ?? ""),
  );
}
function evaluateFormula(formula: string, data: Record<string, unknown>) {
  const rendered = interpolate(formula, data).trim();
  if (!rendered) return "";
  if (/^[\d\s+\-*/%.()]+$/.test(rendered)) {
    try {
      const result = Function(
        `"use strict"; return (${rendered})`,
      )() as unknown;
      if (typeof result === "number" && Number.isFinite(result))
        return String(result);
    } catch {
      throw new Error(`公式无法计算：${formula}`);
    }
  }
  return rendered;
}
async function callModel(
  workspaceId: string,
  prompt: string,
  connectionId?: string,
  systemPrompt?: string,
) {
  const connection = await db.modelConnection.findFirst({
    where: {
      workspaceId,
      kind: "TEXT",
      enabled: true,
      ...(connectionId ? { id: connectionId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!connection) throw new Error("没有启用的文本模型连接");
  const apiBase = (
    connection.apiBase ||
    (connection.provider === "ollama"
      ? "http://localhost:11434"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");
  const messages = [
    ...(systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }]
      : []),
    { role: "user" as const, content: prompt },
  ];
  const requestModel = async (url: string, init: RequestInit) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "网络连接失败";
      let host = apiBase;
      try {
        host = new URL(apiBase).host;
      } catch {}
      throw new Error(`无法连接模型服务 ${connection.name}（${host}）：${reason}`);
    }
  };
  if (connection.provider === "ollama") {
    const response = await requestModel(`${apiBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: connection.model,
        stream: false,
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    const payload = (await response.json()) as {
      message?: { content?: string };
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error || "Ollama 调用失败");
    const content = payload.message?.content?.trim() || "";
    if (!content) throw new Error("文本模型返回了空内容");
    return content;
  }
  const response = await requestModel(`${apiBase}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${
        connection.encryptedKey
          ? decryptCredential(connection.encryptedKey)
              .trim()
              .replace(/[，,;；]+$/, "")
          : ""
      }`,
    },
    body: JSON.stringify({
      model: connection.model,
      messages,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(payload.error?.message || "文本模型调用失败");
  const content = payload.choices?.[0]?.message?.content?.trim() || "";
  if (!content) throw new Error("文本模型返回了空内容");
  return content;
}
async function activeArchiveStorage(workspaceId: string) {
  const setting = await db.workspaceSetting.findUnique({
    where: { workspaceId_key: { workspaceId, key: "imageArchive" } },
  });
  const policy = (setting?.value || {}) as {
    target?: string;
    storageConnectionId?: string;
  };
  if (policy.target !== "OWN" || !policy.storageConnectionId) return null;
  return db.storageConnection.findFirst({
    where: { id: policy.storageConnectionId, workspaceId, enabled: true },
  });
}
async function putStorageObject(
  storage: NonNullable<Awaited<ReturnType<typeof activeArchiveStorage>>>,
  key: string,
  bytes: Buffer,
  contentType: string,
) {
  const client = new S3Client({
    region: storage.region || "auto",
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: decryptCredential(storage.encryptedAccessKey),
      secretAccessKey: decryptCredential(storage.encryptedSecretKey),
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: storage.bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  const base = (
    storage.publicBaseUrl ||
    `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}`
  ).replace(/\/$/, "");
  return `${base}/${key}`;
}
async function runImageGenerate(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as {
    imageIds: string[];
    modelConnectionId: string;
    operation: string;
    prompt: string;
  };
  const connection = await db.modelConnection.findFirst({
    where: {
      id: payload.modelConnectionId,
      workspaceId: job.workspaceId,
      kind: "IMAGE",
      enabled: true,
    },
  });
  if (!connection) throw new Error("图片模型连接不可用");
  const found = await db.imageAsset.findMany({
    where: {
      id: { in: payload.imageIds },
      archived: false,
      product: { batch: { workspaceId: job.workspaceId } },
    },
    include: { product: { include: { batch: true } } },
  });
  const byId = new Map(found.map((image) => [image.id, image]));
  const images = payload.imageIds
    .map((imageId) => byId.get(imageId))
    .filter((image): image is NonNullable<typeof image> => Boolean(image));
  if (images.length !== payload.imageIds.length)
    throw new Error("部分图片已归档或不存在，请刷新图片工作台后重试");
  const apiBase = (connection.apiBase || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const apiRoot = apiBase.replace(/\/images\/(?:generations|edits)$/i, "");
  const editsEndpoint = `${apiRoot}/images/edits`;
  await event(id, `开始执行图片任务：${payload.operation}`, {
    total: images.length,
    model: connection.model,
  });
  for (let index = job.completedItems; index < images.length; index++) {
    const state = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      state.status === JobStatus.PAUSED ||
      state.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        state.status === JobStatus.PAUSED
          ? "图片任务已安全暂停"
          : "图片任务已取消",
      );
      return;
    }
    const image = images[index];
    const existing = await db.imageVersion.findUnique({
      where: { imageId_jobId: { imageId: image.id, jobId: id } },
    });
    if (existing) {
      const completed = index + 1;
      await db.job.update({
        where: { id },
        data: {
          completedItems: completed,
          heartbeatAt: new Date(),
          events: {
            create: {
              level: "INFO",
              message: `跳过已完成图片 ${completed}/${images.length}（重试幂等）`,
            },
          },
        },
      });
      continue;
    }
    const localSource = await readPrivateUpload(image.sourceUrl);
    let sourceBytes: Uint8Array<ArrayBuffer>;
    let sourceType: string;
    let sourceUrl = image.sourceUrl;
    if (localSource) {
      sourceBytes = new Uint8Array(localSource.bytes);
      sourceType = localSource.contentType;
    } else {
      if (!/^https?:\/\//i.test(sourceUrl)) {
      const source = image.product.batch.source;
      const siteId = source.startsWith("FECIFY:")
        ? source.slice("FECIFY:".length)
        : "";
      const sourceSite = siteId
        ? await db.siteConnection.findFirst({
            where: { id: siteId, workspaceId: job.workspaceId },
          })
        : null;
      if (!sourceSite) throw new Error("相对图片地址缺少站点连接");
      const capabilities = (sourceSite.capabilities || {}) as {
        baseImageUrl?: string;
      };
      const imageBase =
        capabilities.baseImageUrl ||
        `${new URL(sourceSite.apiUrl).origin}/media`;
      sourceUrl = new URL(
        sourceUrl.replace(/^\//, ""),
        `${imageBase.replace(/\/$/, "")}/`,
      ).toString();
      }
      const sourceResponse = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!sourceResponse.ok)
        throw new Error(`下载参考原图失败（HTTP ${sourceResponse.status}）`);
      sourceBytes = new Uint8Array(await sourceResponse.arrayBuffer());
      sourceType = (sourceResponse.headers.get("content-type") || "image/jpeg")
        .split(";")[0]
        .trim();
    }
    if (!/^image\/(png|jpe?g|webp)$/i.test(sourceType))
      throw new Error(`参考原图格式不受支持：${sourceType}`);
    if (sourceBytes.byteLength > 25 * 1024 * 1024)
      throw new Error("参考原图超过 25MB，无法提交图片编辑");
    const extension = sourceType.includes("png")
      ? "png"
      : sourceType.includes("webp")
        ? "webp"
        : "jpg";
    const prompt = `${payload.prompt}\n操作：${payload.operation}\n必须保留参考图中的商品主体、结构、比例、材质、品牌标识与关键细节，不得替换成其他商品。`;
    const form = new FormData();
    form.append("model", connection.model);
    form.append("prompt", prompt);
    form.append(
      "image",
      new Blob([sourceBytes], { type: sourceType }),
      `source-${image.id}.${extension}`,
    );
    form.append("n", "1");
    form.append("response_format", "url");
    await event(id, `参考原图已附加：${index + 1}/${images.length}`, {
      imageId: image.id,
      endpoint: "/v1/images/edits",
      sourceBytes: sourceBytes.byteLength,
      sourceType,
    });
    const response = await fetch(editsEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${
          connection.encryptedKey
            ? decryptCredential(connection.encryptedKey)
                .trim()
                .replace(/[，,;；]+$/, "")
            : ""
        }`,
      },
      body: form,
      signal: AbortSignal.timeout(180_000),
    });
    const result = (await response.json()) as {
      data?: Array<{ url?: string; b64_json?: string }>;
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(
        result.error?.message || `图片模型调用失败（HTTP ${response.status}）`,
      );
    const output = result.data?.[0];
    if (!output?.url && !output?.b64_json)
      throw new Error("图片模型没有返回图片");
    let url = output.url || "";
    const archiveStorage = await activeArchiveStorage(job.workspaceId);
    if (archiveStorage) {
      const bytes = output.b64_json
        ? Buffer.from(output.b64_json, "base64")
        : Buffer.from(
            await (
              await fetch(url, { signal: AbortSignal.timeout(60_000) })
            ).arrayBuffer(),
          );
      const prefix = archiveStorage.pathPrefix.replace(/^\/+|\/+$/g, "");
      url = await putStorageObject(
        archiveStorage,
        `${prefix}/generated/${id}/${image.id}.png`,
        bytes,
        "image/png",
      );
    } else if (output.b64_json) {
      const filename = `${randomUUID()}.png`;
      const directory = path.join(process.cwd(), "public", "generated");
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, filename),
        Buffer.from(output.b64_json, "base64"),
      );
      url = `/generated/${filename}`;
    }
    await db.imageVersion.create({
      data: {
        imageId: image.id,
        jobId: id,
        url,
        operation: payload.operation,
        status: "REVIEW",
        metadata: {
          prompt: payload.prompt,
          modelConnectionId: connection.id,
          model: connection.model,
          endpoint: "/v1/images/edits",
          referenceImageAttached: true,
          sourceBytes: sourceBytes.byteLength,
          sourceType,
          storageConnectionId: archiveStorage?.id || null,
        },
      },
    });
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, images.length - completed),
        events: {
          create: {
            level: "INFO",
            message: `已生成 ${completed}/${images.length}，等待审核`,
            detail: { imageId: image.id },
          },
        },
      },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "REVIEW",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: { generated: images.length },
      events: {
        create: { level: "INFO", message: "图片生成完成，等待人工审核" },
      },
    },
  });
}
async function runImageArchive(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as {
    imageIds: string[];
    storageConnectionId: string;
    mode?: "original" | "adopted";
  };
  const storage = await db.storageConnection.findFirst({
    where: {
      id: payload.storageConnectionId,
      workspaceId: job.workspaceId,
      enabled: true,
    },
  });
  if (!storage) throw new Error("归档存储连接不可用");
  const client = new S3Client({
    region: storage.region || "auto",
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: decryptCredential(storage.encryptedAccessKey),
      secretAccessKey: decryptCredential(storage.encryptedSecretKey),
    },
  });
  const found = await db.imageAsset.findMany({
    where: {
      id: { in: payload.imageIds },
      archived: false,
      product: { batch: { workspaceId: job.workspaceId } },
    },
    include: {
      product: { include: { batch: true } },
      versions: { where: { isActive: true }, take: 1 },
    },
  });
  const byId = new Map(found.map((x) => [x.id, x]));
  const images = payload.imageIds
    .map((x) => byId.get(x))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (images.length !== payload.imageIds.length)
    throw new Error("部分归档图片已不存在");
  await event(id, `开始归档到 ${storage.name}`, {
    bucket: storage.bucket,
    total: images.length,
  });
  for (let index = job.completedItems; index < images.length; index++) {
    const state = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      state.status === JobStatus.PAUSED ||
      state.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        state.status === JobStatus.PAUSED
          ? "归档任务已安全暂停"
          : "归档任务已取消",
      );
      return;
    }
    const image = images[index];
    if (payload.mode === "adopted") {
      const active = image.versions[0];
      if (!active) throw new Error("所选图片没有已采用版本");
      const currentMetadata =
        active.metadata &&
        typeof active.metadata === "object" &&
        !Array.isArray(active.metadata)
          ? (active.metadata as Record<string, unknown>)
          : {};
      if (currentMetadata.storageConnectionId === storage.id) {
        await db.job.update({
          where: { id },
          data: { completedItems: index + 1, heartbeatAt: new Date() },
        });
        continue;
      }
      let bytes: Buffer;
      let contentType = "image/jpeg";
      if (active.url.startsWith("/")) {
        const publicRoot = path.resolve(process.cwd(), "public");
        const target = path.resolve(
          publicRoot,
          decodeURIComponent(active.url.split(/[?#]/)[0]).replace(/^\/+/, ""),
        );
        if (!target.startsWith(`${publicRoot}${path.sep}`))
          throw new Error("采用版本的本地路径无效");
        bytes = await readFile(target);
        contentType = active.url.toLowerCase().includes(".png")
          ? "image/png"
          : active.url.toLowerCase().includes(".webp")
            ? "image/webp"
            : "image/jpeg";
      } else {
        const response = await fetch(active.url, {
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok)
          throw new Error(`下载已采用图片失败（HTTP ${response.status}）`);
        bytes = Buffer.from(await response.arrayBuffer());
        contentType = response.headers.get("content-type") || "image/jpeg";
      }
      const extension = contentType.includes("png")
        ? "png"
        : contentType.includes("webp")
          ? "webp"
          : "jpg";
      const prefix = storage.pathPrefix.replace(/^\/+|\/+$/g, "");
      const key = `${prefix}/adopted/${image.productId}/${image.id}/${active.id}.${extension}`;
      await client.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
        }),
      );
      const base = (
        storage.publicBaseUrl ||
        `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}`
      ).replace(/\/$/, "");
      const archivedUrl = `${base}/${key}`;
      await db.imageVersion.update({
        where: { id: active.id },
        data: {
          url: archivedUrl,
          metadata: {
            ...currentMetadata,
            storageConnectionId: storage.id,
            archivedAt: new Date().toISOString(),
            archivedFrom: active.url,
          } as Prisma.InputJsonValue,
        },
      });
      const completed = index + 1;
      await db.job.update({
        where: { id },
        data: {
          completedItems: completed,
          heartbeatAt: new Date(),
          etaSeconds: Math.max(0, images.length - completed),
          events: {
            create: {
              level: "INFO",
              message: `已归档采用版本 ${completed}/${images.length}`,
              detail: { imageId: image.id, versionId: active.id, archivedUrl },
            },
          },
        },
      });
      continue;
    }
    if (image.archiveStorageId === storage.id && image.archiveUrl) {
      await db.job.update({
        where: { id },
        data: { completedItems: index + 1, heartbeatAt: new Date() },
      });
      continue;
    }
    const localSource = await readPrivateUpload(image.sourceUrl);
    let bytes: Buffer;
    let contentType: string;
    let sourceUrl = image.sourceUrl;
    if (localSource) {
      bytes = Buffer.from(localSource.bytes);
      contentType = localSource.contentType;
    } else {
      if (!/^https?:\/\//i.test(sourceUrl)) {
      const source = image.product.batch.source;
      const siteId = source.startsWith("FECIFY:")
        ? source.slice("FECIFY:".length)
        : "";
      const sourceSite = siteId
        ? await db.siteConnection.findFirst({
            where: { id: siteId, workspaceId: job.workspaceId },
          })
        : null;
      if (!sourceSite) throw new Error("相对图片地址缺少站点连接");
      const capabilities = (sourceSite.capabilities || {}) as {
        baseImageUrl?: string;
      };
      const imageBase =
        capabilities.baseImageUrl ||
        `${new URL(sourceSite.apiUrl).origin}/media`;
      sourceUrl = new URL(
        sourceUrl.replace(/^\//, ""),
        `${imageBase.replace(/\/$/, "")}/`,
      ).toString();
      }
      const response = await fetch(sourceUrl, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`下载远端图片失败（HTTP ${response.status}）`);
      bytes = Buffer.from(await response.arrayBuffer());
      contentType = response.headers.get("content-type") || "image/jpeg";
    }
    const extension = contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg";
    const prefix = storage.pathPrefix.replace(/^\/+|\/+$/g, "");
    const key = `${prefix}/originals/${image.productId}/${image.id}.${extension}`;
    await client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
      }),
    );
    const base = (
      storage.publicBaseUrl ||
      `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}`
    ).replace(/\/$/, "");
    const archiveUrl = `${base}/${key}`;
    await db.imageAsset.update({
      where: { id: image.id },
      data: {
        archiveUrl,
        archiveStorageId: storage.id,
        archivedAt: new Date(),
      },
    });
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, images.length - completed),
        events: {
          create: {
            level: "INFO",
            message: `已归档 ${completed}/${images.length}`,
            detail: { imageId: image.id, archiveUrl },
          },
        },
      },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: {
        archived: images.length,
        storage: storage.name,
        mode: payload.mode || "original",
      },
      events: {
        create: {
          level: "INFO",
          message:
            payload.mode === "adopted"
              ? "已采用图片归档完成"
              : "远端图片归档完成",
        },
      },
    },
  });
}

async function runWorkspaceDataPurge(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const workspaceId = job.workspaceId;
  const [storages, images] = await Promise.all([
    db.storageConnection.findMany({ where: { workspaceId, enabled: true } }),
    db.imageAsset.findMany({
      where: { product: { batch: { workspaceId } } },
      select: {
        sourceUrl: true,
        archiveUrl: true,
        versions: { select: { url: true } },
      },
    }),
  ]);
  const urls = images
    .flatMap((image) => [
      image.archiveUrl,
      ...image.versions.map((version) => version.url),
    ])
    .filter((value): value is string => Boolean(value));
  let remoteDeleted = 0;
  let remoteFailed = 0;
  for (const storage of storages) {
    const base = `${(
      storage.publicBaseUrl ||
      `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}`
    ).replace(/\/$/, "")}/`;
    const keys = [
      ...new Set(
        urls.flatMap((rawUrl) => {
          try {
            const cleanUrl = new URL(rawUrl);
            const cleanBase = new URL(base);
            if (
              cleanUrl.origin !== cleanBase.origin ||
              !cleanUrl.pathname.startsWith(cleanBase.pathname)
            )
              return [];
            const key = decodeURIComponent(
              cleanUrl.pathname.slice(cleanBase.pathname.length),
            );
            return key && !key.startsWith("/") && !key.includes("../")
              ? [key]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ];
    if (!keys.length) continue;
    const client = new S3Client({
      region: storage.region || "auto",
      endpoint: storage.endpoint,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: decryptCredential(storage.encryptedAccessKey),
        secretAccessKey: decryptCredential(storage.encryptedSecretKey),
      },
    });
    for (let offset = 0; offset < keys.length; offset += 1000) {
      const chunk = keys.slice(offset, offset + 1000);
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: storage.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: false },
        }),
      );
      remoteDeleted += result.Deleted?.length || 0;
      remoteFailed += result.Errors?.length || 0;
      if (result.Errors?.length) {
        await event(
          id,
          "部分远程归档对象删除失败",
          { storage: storage.name, errors: result.Errors },
          "WARN",
        );
      }
    }
  }
  await db.job.update({
    where: { id },
    data: {
      completedItems: 1,
      heartbeatAt: new Date(),
      events: {
        create: {
          message: `远程对象清理完成：成功 ${remoteDeleted}，失败 ${remoteFailed}`,
          level: remoteFailed ? "WARN" : "INFO",
        },
      },
    },
  });

  const uploadRoot = path.resolve(
    process.cwd(),
    "public",
    "uploads",
    "private",
  );
  let localDeleted = 0;
  for (const sourceUrl of images.map((image) => image.sourceUrl)) {
    if (!sourceUrl.startsWith("/uploads/private/")) continue;
    const relative = decodeURIComponent(sourceUrl.split(/[?#]/)[0]).replace(
      /^\/+/,
      "",
    );
    const target = path.resolve(process.cwd(), "public", relative);
    if (target !== uploadRoot && !target.startsWith(`${uploadRoot}${path.sep}`))
      continue;
    try {
      await unlink(target);
      localDeleted += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  await db.job.update({
    where: { id },
    data: {
      completedItems: 2,
      heartbeatAt: new Date(),
      events: {
        create: {
          level: "INFO",
          message: `本地上传文件清理完成：${localDeleted} 个`,
        },
      },
    },
  });

  const removed = await db.$transaction(async (tx) => {
    const jobs = await tx.job.deleteMany({
      where: { workspaceId, id: { not: id } },
    });
    const batches = await tx.importBatch.deleteMany({ where: { workspaceId } });
    const terms = await tx.term.deleteMany({ where: { workspaceId } });
    const content = await tx.contentRecord.deleteMany({
      where: { workspaceId },
    });
    await tx.auditLog.deleteMany({ where: { workspaceId } });
    await tx.migrationLog.deleteMany({ where: { workspaceId } });
    return {
      jobs: jobs.count,
      batches: batches.count,
      terms: terms.count,
      content: content.count,
    };
  });
  await db.job.update({
    where: { id },
    data: {
      completedItems: 3,
      heartbeatAt: new Date(),
      events: {
        create: {
          level: "INFO",
          message: "工作区业务数据已清理",
          detail: removed,
        },
      },
    },
  });
  await db.auditLog.create({
    data: {
      workspaceId,
      action: "WORKSPACE_DATA_PURGED",
      entityType: "Workspace",
      entityId: workspaceId,
      detail: { ...removed, remoteDeleted, remoteFailed, localDeleted },
    },
  });
  await db.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      completedItems: 4,
      finishedAt: new Date(),
      heartbeatAt: new Date(),
      etaSeconds: 0,
      result: { ...removed, remoteDeleted, remoteFailed, localDeleted },
      events: {
        create: {
          message: "工作区上传数据清理完成",
          level: remoteFailed ? "WARN" : "INFO",
        },
      },
    },
  });
}
async function runProductDraftWriteback(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as {
    batchId: string;
    imageIds?: string[];
    items: Array<{
      productId: string;
      sourceProductId: string;
      fields: Record<string, unknown>;
    }>;
  };
  const batch = await db.importBatch.findFirst({
    where: { id: payload.batchId, workspaceId: job.workspaceId },
  });
  if (!batch?.source.startsWith("FECIFY:"))
    throw new Error("写回批次或站点来源无效");
  const site = await db.siteConnection.findFirst({
    where: {
      id: batch.source.slice("FECIFY:".length),
      workspaceId: job.workspaceId,
    },
  });
  if (!site) throw new Error("原 JOFSHOP 站点连接不存在");
  for (let index = job.completedItems; index < payload.items.length; index++) {
    const state = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      state.status === JobStatus.PAUSED ||
      state.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        state.status === JobStatus.PAUSED
          ? "商品写回已安全暂停"
          : "商品写回已取消",
      );
      return;
    }
    const item = payload.items[index];
    const response = await fetch(
      `${site.apiUrl.replace(/\/$/, "")}/api/skill/product/update-columns`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "skill-access-token": decryptCredential(site.encryptedToken),
        },
        body: JSON.stringify({
          id: Number(item.sourceProductId),
          ...item.fields,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const result = (await response.json()) as {
      code?: number;
      message?: string;
    };
    if (!response.ok || result.code !== 200)
      throw new Error(
        result.message || `JOFSHOP 写回失败 HTTP ${response.status}`,
      );
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, payload.items.length - completed),
        events: {
          create: {
            level: "INFO",
            message: `已同步商品 ${completed}/${payload.items.length}`,
            detail: {
              productId: item.productId,
              fields: Object.keys(item.fields),
            },
          },
        },
      },
    });
  }
  await db.auditLog.create({
    data: {
      workspaceId: job.workspaceId,
      action: "FECIFY_PRODUCT_DRAFT_WRITEBACK",
      entityType: "ImportBatch",
      entityId: payload.batchId,
      detail: { jobId: id, count: payload.items.length },
    },
  });
  if (payload.imageIds?.length) {
    await db.imageVersion.updateMany({
      where: { imageId: { in: payload.imageIds }, isActive: true },
      data: { syncedAt: new Date() },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: { synced: payload.items.length },
      events: {
        create: { level: "INFO", message: "商品处理结果已同步到独立站" },
      },
    },
  });
}
async function fecifyPost(
  site: { apiUrl: string; encryptedToken: string },
  pathName: string,
  body: unknown,
) {
  const response = await fetch(`${site.apiUrl.replace(/\/$/, "")}${pathName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "skill-access-token": decryptCredential(site.encryptedToken),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json()) as {
    code?: number;
    message?: string;
    data?: unknown;
  };
  if (!response.ok || payload.code !== 200)
    throw new Error(payload.message || `JOFSHOP 返回 HTTP ${response.status}`);
  return payload.data || {};
}
async function runProductTranslationWriteback(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as { translationJobId: string };
  const translation = await db.translationJob.findFirst({
    where: {
      id: payload.translationJobId,
      job: { workspaceId: job.workspaceId },
    },
    include: { items: true },
  });
  if (!translation) throw new Error("商品翻译任务不存在");
  const options = (translation.options || {}) as { batchId?: string };
  const batch = options.batchId
    ? await db.importBatch.findFirst({
        where: { id: options.batchId, workspaceId: job.workspaceId },
      })
    : null;
  if (!batch?.source.startsWith("FECIFY:"))
    throw new Error("翻译任务没有可写回的 JOFSHOP 批次");
  const site = await db.siteConnection.findFirst({
    where: {
      id: batch.source.slice("FECIFY:".length),
      workspaceId: job.workspaceId,
    },
  });
  if (!site) throw new Error("独立站连接不存在");
  const productIds = [
    ...new Set(translation.items.map((item) => item.sourceId).filter(Boolean)),
  ] as string[];
  const products = await db.productDraft.findMany({
    where: { id: { in: productIds }, batchId: batch.id },
    orderBy: { rowIndex: "asc" },
  });
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  let failed = 0;
  for (let index = job.completedItems; index < products.length; index++) {
    const product = products[index];
    if (!product.sourceId) continue;
    const translations = languages.map(
      (language) =>
        Object.fromEntries([
          ["lang_code", language],
          ...translation.items
            .filter((item) => item.sourceId === product.id)
            .map((item) => {
              const values =
                item.translations &&
                typeof item.translations === "object" &&
                !Array.isArray(item.translations)
                  ? (item.translations as Record<string, unknown>)
                  : {};
              return [item.field, String(values[language] || "")];
            }),
        ]) as Record<string, string>,
    );
    const key = createHash("sha256")
      .update(`${translation.id}:${product.id}:${JSON.stringify(translations)}`)
      .digest("hex");
    const existing = await db.writebackRecord.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing?.status !== "COMPLETED") {
      const record = await db.writebackRecord.upsert({
        where: { idempotencyKey: key },
        update: {
          status: "RUNNING",
          error: null,
          requestPayload: translations as Prisma.InputJsonValue,
        },
        create: {
          workspaceId: job.workspaceId,
          translationJobId: translation.id,
          productId: product.id,
          sourceProductId: product.sourceId,
          idempotencyKey: key,
          status: "RUNNING",
          requestPayload: translations as Prisma.InputJsonValue,
        },
      });
      try {
        const response = await fecifyPost(
          site,
          "/api/skill/addons-language/save-product-translate",
          { product_id: product.sourceId, product_translate: translations },
        );
        await db.writebackRecord.update({
          where: { id: record.id },
          data: {
            status: "COMPLETED",
            responsePayload: response as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        failed++;
        await db.writebackRecord.update({
          where: { id: record.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "写回失败",
          },
        });
      }
    }
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        failedItems: failed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, products.length - completed),
        events: {
          create: {
            level: failed ? "WARN" : "INFO",
            message: `商品翻译写回 ${completed}/${products.length}`,
          },
        },
      },
    });
  }
  await db.auditLog.create({
    data: {
      workspaceId: job.workspaceId,
      action: "FECIFY_TRANSLATION_WRITEBACK",
      entityType: "TranslationJob",
      entityId: translation.id,
      detail: { jobId: id, total: products.length, failed },
    },
  });
  await db.job.update({
    where: { id },
    data: {
      status: failed ? "PARTIALLY_COMPLETED" : "COMPLETED",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: { written: products.length - failed, failed },
      events: {
        create: {
          level: failed ? "WARN" : "INFO",
          message: failed
            ? `写回完成，${failed} 个失败`
            : "商品翻译已全部写回独立站",
        },
      },
    },
  });
}
const contentWritebackConfig = {
  collections: {
    path: "/api/skill/addons-language/save-collection-translate",
    idKey: "collection_id",
    root: "collection_translate",
  },
  articles: {
    path: "/api/skill/addons-language/save-blog-article-translate",
    idKey: "article_id",
    root: "blog_article_translate",
  },
  "blog-collections": {
    path: "/api/skill/addons-language/save-blog-collection-translate",
    idKey: "collection_id",
    root: "blog_collection_translate",
  },
  pages: {
    path: "/api/skill/addons-language/save-page-translate",
    idKey: "page_id",
    root: "page_translate",
  },
} as const;
async function runContentWriteback(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as { translationJobId: string };
  const translation = await db.translationJob.findFirst({
    where: {
      id: payload.translationJobId,
      job: { workspaceId: job.workspaceId, type: "CONTENT_TRANSLATION" },
    },
    include: { items: true },
  });
  if (!translation) throw new Error("内容翻译任务不存在");
  const options = (translation.options || {}) as {
    entity?: keyof typeof contentWritebackConfig | "site";
  };
  if (!options.entity) throw new Error("内容类型缺失");
  const ids = [
    ...new Set(translation.items.map((item) => item.sourceId).filter(Boolean)),
  ] as string[];
  const records = await db.contentRecord.findMany({
    where: { id: { in: ids }, workspaceId: job.workspaceId },
    orderBy: { createdAt: "asc" },
  });
  const site = records[0]
    ? await db.siteConnection.findFirst({
        where: { id: records[0].siteId, workspaceId: job.workspaceId },
      })
    : null;
  if (!site) throw new Error("独立站连接不存在");
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  let failed = 0;
  for (let index = job.completedItems; index < records.length; index++) {
    const record = records[index];
    const translations = languages.map(
      (language) =>
        Object.fromEntries([
          ["lang_code", language],
          ...translation.items
            .filter((item) => item.sourceId === record.id)
            .map((item) => [
              item.field,
              String(
                (item.translations as Record<string, unknown> | null)?.[
                  language
                ] ?? item.sourceText,
              ),
            ]),
        ]) as Record<string, string>,
    );
    const key = createHash("sha256")
      .update(
        `${translation.id}:${options.entity}:${record.sourceId}:${JSON.stringify(translations)}`,
      )
      .digest("hex");
    const existing = await db.contentWritebackRecord.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing?.status !== "COMPLETED") {
      const row = await db.contentWritebackRecord.upsert({
        where: { idempotencyKey: key },
        update: {
          status: "RUNNING",
          error: null,
          requestPayload: translations as Prisma.InputJsonValue,
        },
        create: {
          workspaceId: job.workspaceId,
          translationJobId: translation.id,
          entityType: options.entity,
          sourceId: record.sourceId,
          idempotencyKey: key,
          status: "RUNNING",
          requestPayload: translations as Prisma.InputJsonValue,
        },
      });
      try {
        let response: unknown;
        if (options.entity === "site")
          response = await fecifyPost(
            site,
            "/api/skill/addons-language/set-site-seo-translate",
            { site_seo_translate: translations },
          );
        else {
          const config = contentWritebackConfig[options.entity];
          response = await fecifyPost(site, config.path, {
            [config.idKey]: record.sourceId,
            [config.root]: translations,
          });
        }
        await db.contentWritebackRecord.update({
          where: { id: row.id },
          data: {
            status: "COMPLETED",
            responsePayload: response as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        failed++;
        await db.contentWritebackRecord.update({
          where: { id: row.id },
          data: {
            status: "FAILED",
            error: error instanceof Error ? error.message : "写回失败",
          },
        });
      }
    }
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        failedItems: failed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, records.length - completed),
        events: {
          create: {
            level: failed ? "WARN" : "INFO",
            message: `内容写回 ${completed}/${records.length}`,
          },
        },
      },
    });
  }
  await db.auditLog.create({
    data: {
      workspaceId: job.workspaceId,
      action: "CONTENT_WRITEBACK",
      entityType: options.entity,
      entityId: translation.id,
      detail: { jobId: id, total: records.length, failed },
    },
  });
  await db.job.update({
    where: { id },
    data: {
      status: failed ? "PARTIALLY_COMPLETED" : "COMPLETED",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: { written: records.length - failed, failed },
      events: {
        create: {
          level: failed ? "WARN" : "INFO",
          message: failed
            ? `内容写回完成，${failed} 条失败`
            : "内容已全部写回独立站",
        },
      },
    },
  });
}
async function runProductFieldGenerate(id: string) {
  const job = await db.job.findUniqueOrThrow({ where: { id } });
  const payload = job.payload as {
    batchId: string;
    fieldId: string;
    productIds?: string[];
  };
  const field = await db.fieldDefinition.findUniqueOrThrow({
    where: { id: payload.fieldId },
    include: { rule: true },
  });
  if (!field.rule) throw new Error("字段执行规则不存在");
  const config = field.rule.config as Record<string, unknown>;
  const products = await db.productDraft.findMany({
    where: {
      batchId: payload.batchId,
      ...(payload.productIds?.length ? { id: { in: payload.productIds } } : {}),
    },
    orderBy: { rowIndex: "asc" },
  });
  await event(id, `Worker 开始执行字段规则：${field.label}`, {
    kind: field.rule.kind,
    total: products.length,
  });
  for (let index = job.completedItems; index < products.length; index++) {
    const current = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      current.status === JobStatus.PAUSED ||
      current.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        current.status === JobStatus.PAUSED
          ? "字段任务已安全暂停"
          : "字段任务已取消",
      );
      return;
    }
    const product = products[index];
    const data =
      product.data &&
      typeof product.data === "object" &&
      !Array.isArray(product.data)
        ? (product.data as Record<string, unknown>)
        : {};
    let value = "";
    if (field.rule.kind === "COPY" || field.rule.kind === "REFERENCE")
      value = String(data[String(config.sourceField || "")] ?? "");
    else if (field.rule.kind === "TEMPLATE")
      value = interpolate(String(config.template || ""), data);
    else if (field.rule.kind === "AI")
      value = await callModel(
        job.workspaceId,
        interpolate(
          String(config.prompt || "请根据以下商品数据生成内容：{{title}}"),
          data,
        ),
        String(config.modelConnectionId || "") || undefined,
      );
    else if (field.rule.kind === "FORMULA")
      value = evaluateFormula(String(config.formula || ""), data);
    else throw new Error(`不支持的字段规则：${field.rule.kind}`);
    await db.$transaction(async (tx) => {
      await tx.productDraft.update({
        where: { id: product.id },
        data: {
          data: JSON.parse(
            JSON.stringify({ ...data, [field.key]: value }),
          ) as Prisma.InputJsonValue,
        },
      });
      if (JSON.stringify(data[field.key] ?? null) !== JSON.stringify(value))
        await tx.productChangeLog.create({
          data: {
            productId: product.id,
            action: `FIELD_${field.rule!.kind}`,
            field: field.key,
            before: JSON.parse(
              JSON.stringify(data[field.key] ?? null),
            ) as Prisma.InputJsonValue,
            after: value,
            detail: { jobId: id, fieldDefinitionId: field.id },
          },
        });
    });
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, products.length - completed),
        events: {
          create: {
            level: "INFO",
            message: `已处理 ${completed}/${products.length}`,
            detail: { productId: product.id, field: field.key },
          },
        },
      },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "COMPLETED",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: {
        fieldId: field.id,
        fieldKey: field.key,
        processed: products.length,
      },
      events: {
        create: { level: "INFO", message: `字段任务完成：${field.label}` },
      },
    },
  });
}
function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
async function protectTerminology(
  workspaceId: string,
  source: string,
  language: string,
) {
  const terms = await db.term.findMany({
    where: { workspaceId, enabled: true },
    include: { translations: true },
    orderBy: { source: "desc" },
  });
  let text = source;
  const replacements: Array<{ token: string; value: string }> = [];
  for (const term of terms.sort((a, b) => b.source.length - a.source.length)) {
    const translated =
      term.mode === "PRESERVE"
        ? term.source
        : term.translations.find((item) => item.language === language)?.value;
    if (!translated) continue;
    const token = `ZXTERM${String(replacements.length).padStart(3, "0")}XZ`;
    const expression = new RegExp(
      escapeRegExp(term.source),
      term.caseSensitive ? "g" : "gi",
    );
    if (!expression.test(text)) continue;
    text = text.replace(expression, token);
    replacements.push({
      token,
      value: translated + (term.spaceAfter ? " " : ""),
    });
  }
  return {
    text,
    restore(output: string) {
      return replacements.reduce(
        (value, item) =>
          value.replace(new RegExp(item.token, "gi"), item.value),
        output,
      );
    },
  };
}
async function runTranslation(id: string) {
  const base = await db.job.findUniqueOrThrow({ where: { id } });
  const translation = await db.translationJob.findUniqueOrThrow({
    where: { jobId: id },
    include: { items: { orderBy: { id: "asc" } } },
  });
  const options = (translation.options || {}) as { modelConnectionId?: string };
  const promptSetting = await db.workspaceSetting.findUnique({
    where: {
      workspaceId_key: {
        workspaceId: base.workspaceId,
        key: "translationPrompt",
      },
    },
    select: { value: true },
  });
  const systemPrompt =
    (promptSetting?.value as { prompt?: string } | null)?.prompt?.trim() ||
    DEFAULT_TRANSLATION_PROMPT;
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  const operations = translation.items.flatMap((item) =>
    languages.map((language) => ({ item, language })),
  );
  const taskLabel =
    base.type === "CONTENT_TRANSLATION" ? "内容翻译" : "商品翻译";
  await event(id, `Worker 开始${taskLabel}`, {
    items: translation.items.length,
    languages,
  });
  for (let index = base.completedItems; index < operations.length; index++) {
    const state = await db.job.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    if (
      state.status === JobStatus.PAUSED ||
      state.status === JobStatus.CANCELLED
    ) {
      await event(
        id,
        state.status === JobStatus.PAUSED
          ? "翻译任务已安全暂停"
          : "翻译任务已取消",
      );
      return;
    }
    const { item, language } = operations[index];
    const protectedText = await protectTerminology(
      base.workspaceId,
      item.sourceText,
      language,
    );
    const prompt = `源语言：${translation.sourceLanguage === "auto" ? "自动识别" : translation.sourceLanguage}\n目标语言：${language}\n\n待翻译内容：\n${protectedText.text}`;
    const translated = protectedText.restore(
      await callModel(
        base.workspaceId,
        prompt,
        options.modelConnectionId,
        systemPrompt,
      ),
    );
    const current =
      item.translations &&
      typeof item.translations === "object" &&
      !Array.isArray(item.translations)
        ? (item.translations as Record<string, unknown>)
        : {};
    await db.translationItem.update({
      where: { id: item.id },
      data: {
        translations: JSON.parse(
          JSON.stringify({ ...current, [language]: translated }),
        ) as Prisma.InputJsonValue,
        status:
          index % languages.length === languages.length - 1
            ? "COMPLETED"
            : "RUNNING",
        error: null,
      },
    });
    const completed = index + 1;
    await db.job.update({
      where: { id },
      data: {
        completedItems: completed,
        heartbeatAt: new Date(),
        etaSeconds: Math.max(0, operations.length - completed),
        events: {
          create: {
            level: "INFO",
            message: `已翻译 ${completed}/${operations.length}`,
            detail: { itemId: item.id, language },
          },
        },
      },
    });
  }
  await db.job.update({
    where: { id },
    data: {
      status: "REVIEW",
      finishedAt: new Date(),
      etaSeconds: 0,
      result: {
        translationJobId: translation.id,
        translated: operations.length,
      },
      events: {
        create: { level: "INFO", message: `${taskLabel}完成，等待审核` },
      },
    },
  });
}
async function fail(id: string, error: unknown) {
  // 暂停或取消可能发生在耗时的外部请求期间；这类任务返回后不应被
  // 通用异常处理重新标记为失败或再次入队。
  const job = await db.job.findUnique({ where: { id } });
  if (!job || job.status !== JobStatus.RUNNING) return;
  const retry = job.attempt < job.maxAttempts;
  await db.job.update({
    where: { id },
    data: {
      status: retry ? "RETRYING" : "FAILED",
      availableAt: new Date(
        Date.now() + Math.min(30_000, 1000 * 2 ** job.attempt),
      ),
      workerId: null,
      lockedAt: null,
      finishedAt: retry ? null : new Date(),
      events: {
        create: {
          level: "ERROR",
          message: error instanceof Error ? error.message : "任务执行失败",
        },
      },
    },
  });
}
async function runClaimedJob(id: string) {
  try {
    currentJobId = id;
    await db.workerRuntime.update({
      where: { id: workerId },
      data: { currentJobId: id, heartbeatAt: new Date() },
    });
    const job = await db.job.findUniqueOrThrow({ where: { id } });
    if (job.type === "SYSTEM_TEST") await runSystemTest(id);
    else if (job.type === "PRODUCT_FIELD_GENERATE")
      await runProductFieldGenerate(id);
    else if (
      job.type === "PRODUCT_TRANSLATION" ||
      job.type === "CONTENT_TRANSLATION"
    )
      await runTranslation(id);
    else if (job.type === "IMAGE_GENERATE") await runImageGenerate(id);
    else if (job.type === "IMAGE_ARCHIVE") await runImageArchive(id);
    else if (job.type === "PRODUCT_DRAFT_WRITEBACK")
      await runProductDraftWriteback(id);
    else if (job.type === "PRODUCT_TRANSLATION_WRITEBACK")
      await runProductTranslationWriteback(id);
    else if (job.type === "CONTENT_WRITEBACK") await runContentWriteback(id);
    else if (job.type === "WORKSPACE_DATA_PURGE")
      await runWorkspaceDataPurge(id);
    else throw new Error(`不支持的任务类型: ${job.type}`);
  } catch (error) {
    await fail(id, error);
  }
}
async function main() {
  console.log(`${workerId} started`);
  await db.workerRuntime.upsert({
    where: { id: workerId },
    update: {
      status: "ONLINE",
      processId: process.pid,
      hostname: hostname(),
      heartbeatAt: new Date(),
      stoppedAt: null,
    },
    create: {
      id: workerId,
      status: "ONLINE",
      processId: process.pid,
      hostname: hostname(),
      metadata: { version: "platform-worker-v1" },
    },
  });
  heartbeatTimer = setInterval(() => {
    void db.workerRuntime
      .update({
        where: { id: workerId },
        data: { status: "ONLINE", heartbeatAt: new Date(), currentJobId },
      })
      .catch(() => undefined);
  }, 5_000);
  heartbeatTimer.unref();
  const running = new Map<string, Promise<void>>();
  while (!stopping) {
    await recoverStale();
    const concurrency = await workerConcurrency();
    while (!stopping && running.size < concurrency) {
      const id = await claim();
      if (!id) break;
      const task = runClaimedJob(id).finally(() => {
        running.delete(id);
      });
      running.set(id, task);
    }
    currentJobId = running.keys().next().value || null;
    await db.workerRuntime
      .update({
        where: { id: workerId },
        data: { currentJobId, heartbeatAt: new Date() },
      })
      .catch(() => undefined);
    if (!running.size) {
      await wait(1000);
      continue;
    }
    await Promise.race(running.values());
  }
  await Promise.allSettled(running.values());
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await db.workerRuntime
    .update({
      where: { id: workerId },
      data: {
        status: "OFFLINE",
        stoppedAt: new Date(),
        currentJobId: null,
        heartbeatAt: new Date(),
      },
    })
    .catch(() => undefined);
  await db.$disconnect();
}
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});
void main();
