import { db } from "@/lib/db";
import { decryptCredential } from "@/lib/crypto";
import { getSocialProvider } from "@/lib/integrations/social";

export type PublishMediaItem = {
  path: string;
  contentType?: string;
};

// 核心发布逻辑：解密频道凭据 → 调平台 provider.publish → 回写 SocialPost。
// 供 API（立即发布测试）与 Worker（SOCIAL_PUBLISH 排期任务）复用。
export async function publishSocialPost(postId: string) {
  const post = await db.socialPost.findUnique({
    where: { id: postId },
    include: { channel: true },
  });
  if (!post) throw new Error(`帖子不存在: ${postId}`);
  if (post.status !== "QUEUED") return { skipped: true as const };
  const provider = getSocialProvider(post.channel.platform);
  if (!provider) throw new Error(`平台 ${post.channel.platform} 未接入`);
  const credentials = {
    accessToken: decryptCredential(post.channel.encryptedAccessToken),
    ...(post.channel.encryptedRefreshToken
      ? { refreshToken: decryptCredential(post.channel.encryptedRefreshToken) }
      : {}),
  };
  if (!credentials.accessToken) throw new Error("频道凭据缺失，请重新连接");
  const media = Array.isArray(post.media)
    ? (post.media as PublishMediaItem[]).filter(
        (m) => m && typeof m.path === "string",
      )
    : [];
  const profile = {
    id: post.channel.profileId || "",
    name: post.channel.name,
    username: post.channel.username || "",
    picture: post.channel.picture || "",
    metadata: (post.channel.metadata as Record<string, unknown>) || undefined,
  };
  const result = await provider.publish(credentials, post.content, media, profile);
  await db.socialPost.update({
    where: { id: post.id },
    data: {
      status: "PUBLISHED",
      platformPostId: result.platformPostId,
      releaseUrl: result.releaseUrl || null,
      publishedAt: new Date(),
      error: null,
    },
  });
  return { skipped: false as const, result };
}
