import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { decryptCredential } from "@/lib/crypto";
import { imageReviewSchema } from "@/lib/schemas/images";
import { getWorkspaceContext } from "@/lib/workspace-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = imageReviewSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const version = await db.imageVersion.findFirst({
      where: {
        id,
        image: { product: { batch: { workspaceId: workspace.id } } },
      },
    });
    if (!version)
      return Response.json({ error: "图片版本不存在" }, { status: 404 });
    if (input.action === "apply" && input.confirm !== true)
      return Response.json({ error: "切换版本需要明确确认" }, { status: 400 });
    const result = await db.$transaction(async (tx) => {
      if (input.action === "apply") {
        if (!["APPROVED", "REVIEW"].includes(version.status))
          throw new Error("只能采用待审核或已审核通过的版本");
        await tx.imageVersion.updateMany({
          where: { imageId: version.imageId },
          data: { isActive: false },
        });
        return tx.imageVersion.update({
          where: { id },
          data: { isActive: true, status: "APPROVED", reviewedAt: new Date() },
        });
      }
      return tx.imageVersion.update({
        where: { id },
        data: {
          status: input.action === "approve" ? "APPROVED" : "REJECTED",
          reviewedAt: new Date(),
          isActive: false,
        },
      });
    });
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "审核失败" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { workspace } = await getWorkspaceContext();
    const version = await db.imageVersion.findFirst({
      where: {
        id,
        image: { product: { batch: { workspaceId: workspace.id } } },
      },
    });
    if (!version)
      return Response.json({ error: "图片版本不存在" }, { status: 404 });
    if (version.isActive)
      return Response.json(
        { error: "当前采用版本不能删除，请先切换版本" },
        { status: 409 },
      );
    const metadata = (version.metadata || {}) as {
      storageConnectionId?: string | null;
    };
    if (metadata.storageConnectionId) {
      const storage = await db.storageConnection.findFirst({
        where: {
          id: metadata.storageConnectionId,
          workspaceId: workspace.id,
        },
      });
      if (storage) {
        const base = `${(
          storage.publicBaseUrl ||
          `${storage.endpoint.replace(/\/$/, "")}/${storage.bucket}`
        ).replace(/\/$/, "")}/`;
        const fileUrl = new URL(version.url);
        const baseUrl = new URL(base);
        if (
          fileUrl.origin === baseUrl.origin &&
          fileUrl.pathname.startsWith(baseUrl.pathname)
        ) {
          const key = decodeURIComponent(
            fileUrl.pathname.slice(baseUrl.pathname.length),
          );
          if (key && !key.startsWith("/") && !key.includes("../")) {
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
              new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
            );
          }
        }
      }
    } else if (version.url.startsWith("/generated/")) {
      const generatedRoot = path.resolve(process.cwd(), "public", "generated");
      const relative = decodeURIComponent(version.url.split(/[?#]/)[0]).replace(
        /^\/+/,
        "",
      );
      const target = path.resolve(process.cwd(), "public", relative);
      if (target.startsWith(`${generatedRoot}${path.sep}`)) {
        await unlink(target).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
        });
      }
    }
    await db.imageVersion.delete({ where: { id } });
    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "删除失败" },
      { status: 400 },
    );
  }
}
