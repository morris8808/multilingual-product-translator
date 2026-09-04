import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getSocialProvider } from "@/lib/integrations/social";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || undefined;
    const channelId = searchParams.get("channelId") || undefined;
    const rows = await db.socialPost.findMany({
      where: {
        workspaceId: workspace.id,
        ...(status ? { status } : {}),
        ...(channelId ? { channelId } : {}),
      },
      include: { channel: { select: { id: true, platform: true, name: true, picture: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return Response.json({ posts: rows });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "帖子读取失败" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as {
      channelId?: string;
      content?: string;
      scheduledAt?: string | null;
      media?: Array<{ path: string; contentType?: string }>;
      immediate?: boolean;
    };
    const { workspace } = await getWorkspaceContext();
    const contentValue = data.content?.trim() ?? "";
    if (!data.channelId || !contentValue)
      return Response.json({ error: "请选择频道并填写内容" }, { status: 400 });
    const channel = await db.socialChannel.findFirst({
      where: { id: data.channelId, workspaceId: workspace.id, enabled: true },
    });
    if (!channel)
      return Response.json({ error: "频道不存在或已停用" }, { status: 404 });
    const provider = getSocialProvider(channel.platform);
    if (!provider)
      return Response.json({ error: "平台未接入" }, { status: 400 });

    // 校验内容长度上限（各平台近似值，发布时仍会被平台拒绝兜底）
    const maxLength: Record<string, number> = {
      x: 280,
      bluesky: 300,
      mastodon: 500,
      linkedin: 3000,
      facebook: 5000,
      medium: 100000,
    };
    const limit = maxLength[provider.id] || 5000;
    if (contentValue.length > limit)
      return Response.json(
        { error: `${provider.name} 单条内容不能超过 ${limit} 字符（当前 ${contentValue.length}）` },
        { status: 400 },
      );

    // 立即发布：直接创建 job availableAt=now；排期：availableAt=scheduledAt
    const scheduledAt: Date = data.immediate ? new Date() : data.scheduledAt ? new Date(data.scheduledAt) : new Date();
    if (!data.immediate && (!data.scheduledAt || Number.isNaN(scheduledAt.getTime())))
      return Response.json({ error: "排期时间无效" }, { status: 400 });

    const post = await db.$transaction(async (tx) => {
      const created = await tx.socialPost.create({
        data: {
          workspaceId: workspace.id,
          channelId: channel.id,
          content: contentValue,
          media: data.media?.length ? (data.media as object[]) : undefined,
          scheduledAt,
          status: "QUEUED",
        },
      });
      const job = await tx.job.create({
        data: {
          workspaceId: workspace.id,
          type: "SOCIAL_PUBLISH",
          status: "QUEUED",
          displayName: `发布到 ${channel.name}（${provider.name}）`,
          payload: { socialPostId: created.id },
          availableAt: scheduledAt,
          maxAttempts: 3,
        },
      });
      await tx.socialPost.update({
        where: { id: created.id },
        data: { jobId: job.id },
      });
      return created;
    });
    return Response.json({ post });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "帖子创建失败" },
      { status: 400 },
    );
  }
}
