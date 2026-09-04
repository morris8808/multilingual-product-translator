import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { getSocialProvider } from "@/lib/integrations/social";
import { getWorkspaceContext } from "@/lib/workspace-context";

export const runtime = "nodejs";

// OAuth 回调落地：/api/social/channels/callback?platform=x&code=...&state=...
// 完成授权后 302 跳回前端 /social?connected=1
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "";
    const code = searchParams.get("code") || "";
    const state = searchParams.get("state") || "";
    // 短会话里暂存 codeVerifier（X OAuth1 用）：由授权入口写入 cookie，
    // 这里从 URL state 恢复（generateAuthUrl 已把所需信息编码进 state）
    const provider = getSocialProvider(platform);
    const origin =
      process.env.FRONTEND_URL ||
      `${request.headers.get("x-forwarded-proto") || "http"}://${
        request.headers.get("host") || "localhost:3001"
      }`;
    if (!provider?.handleCallback)
      throw new Error(`平台 ${platform} 未实现 OAuth 回调`);
    const { profile, credentials } = await provider.handleCallback(code, state);
    const { workspace } = await getWorkspaceContext();
    if (!workspace) throw new Error("未登录，请先登录工作台");
    const existing = await db.socialChannel.findFirst({
      where: { workspaceId: workspace.id, platform, profileId: profile.id },
    });
    const values = {
      platform,
      kind: provider.kind,
      name: profile.name,
      profileId: profile.id,
      username: profile.username || "",
      picture: profile.picture || "",
      metadata: (profile.metadata ? JSON.parse(JSON.stringify(profile.metadata)) : undefined) as Prisma.InputJsonValue | undefined,
      encryptedAccessToken: encryptCredential(credentials.accessToken),
      ...(credentials.refreshToken
        ? { encryptedRefreshToken: encryptCredential(credentials.refreshToken) }
        : {}),
      ...(credentials.expiresIn
        ? { tokenExpiresAt: new Date(Date.now() + credentials.expiresIn * 1000) }
        : {}),
      enabled: true,
    };
    if (existing) {
      await db.socialChannel.update({ where: { id: existing.id }, data: values });
    } else {
      await db.socialChannel.create({
        data: { ...values, workspaceId: workspace.id },
      });
    }
    return Response.redirect(`${origin}/social?connected=1`, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : "授权失败";
    const origin =
      process.env.FRONTEND_URL ||
      `${request.headers.get("x-forwarded-proto") || "http"}://${
        request.headers.get("host") || "localhost:3001"
      }`;
    return Response.redirect(
      `${origin}/social?error=${encodeURIComponent(message)}`,
      302,
    );
  }
}
