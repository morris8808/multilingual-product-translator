import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";
const PURGE_PHRASE =
  "我已经知晓此操作会清空网站数据库已上传的所有数据和远程存储桶数据，无法恢复";
const secret = () =>
  process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.DATABASE_URL || "";
const sign = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");
const tokenFor = (workspaceId: string) => {
  const payload = `${workspaceId}:${Date.now() + 10 * 60_000}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
};
const validToken = (token: string, workspaceId: string) => {
  try {
    const [encoded, signature] = token.split(".");
    const payload = Buffer.from(encoded, "base64url").toString();
    const expected = sign(payload);
    const [id, expiry] = payload.split(":");
    return (
      id === workspaceId &&
      Number(expiry) > Date.now() &&
      signature.length === expected.length &&
      timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    );
  } catch {
    return false;
  }
};

export async function POST(request: Request) {
  try {
    const { user, workspace } = await getWorkspaceContext();
    if (!["ADMIN", "DEVELOPER"].includes(user.role))
      return Response.json(
        { error: "仅系统管理员或开发者可以执行数据清理" },
        { status: 403 },
      );
    const input = (await request.json()) as {
      action?: string;
      phrase?: string;
      token?: string;
    };
    if (input.phrase !== PURGE_PHRASE)
      return Response.json(
        { error: "确认声明不完整，必须逐字输入" },
        { status: 400 },
      );
    if (input.action === "prepare") {
      const [batches, products, images, jobs] = await Promise.all([
        db.importBatch.count({ where: { workspaceId: workspace.id } }),
        db.productDraft.count({
          where: { batch: { workspaceId: workspace.id } },
        }),
        db.imageAsset.count({
          where: { product: { batch: { workspaceId: workspace.id } } },
        }),
        db.job.count({ where: { workspaceId: workspace.id } }),
      ]);
      return Response.json({
        token: tokenFor(workspace.id),
        preview: { batches, products, images, jobs },
      });
    }
    if (
      input.action !== "execute" ||
      !input.token ||
      !validToken(input.token, workspace.id)
    )
      return Response.json(
        { error: "二次确认已失效，请重新开始" },
        { status: 400 },
      );
    const active = await db.job.findFirst({
      where: {
        workspaceId: workspace.id,
        type: "WORKSPACE_DATA_PURGE",
        status: { in: ["QUEUED", "RUNNING", "RETRYING"] },
      },
    });
    if (active) return Response.json(active);
    const job = await db.job.create({
      data: {
        workspaceId: workspace.id,
        type: "WORKSPACE_DATA_PURGE",
        displayName: "清空当前工作区上传数据",
        status: "QUEUED",
        payload: { requestedBy: user.id },
        totalItems: 4,
        events: {
          create: {
            level: "WARN",
            message: "管理员已完成双重确认，数据清理任务进入队列",
          },
        },
      },
    });
    return Response.json(job, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "无法创建数据清理任务",
      },
      { status: 400 },
    );
  }
}
