import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { encryptCredential } from "@/lib/crypto";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getSocialProvider, listSocialProviders } from "@/lib/integrations/social";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { workspace } = await getWorkspaceContext();
    const rows = await db.socialChannel.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({
      channels: rows.map(({ encryptedAccessToken, encryptedRefreshToken, ...item }) => ({
        ...item,
        hasToken: Boolean(encryptedAccessToken),
        hasRefreshToken: Boolean(encryptedRefreshToken),
      })),
      providers: listSocialProviders().map((p) => ({
        id: p.id,
        name: p.name,
        kind: p.kind,
        connectHint: p.connectHint,
        missingEnv: p.requiredEnv.filter((name) => !process.env[name]),
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "频道读取失败" },
      { status: 503 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const data = (await request.json()) as {
      platform?: string;
      credentials?: string;
      name?: string;
    };
    const provider = data.platform ? getSocialProvider(data.platform) : undefined;
    if (!provider)
      return Response.json({ error: "不支持的平台" }, { status: 400 });
    if (provider.kind === "TOKEN") {
      // 填凭据类平台（bluesky/mastodon/medium）：resolve 换取账号信息 + 长期凭据
      if (!data.credentials)
        return Response.json({ error: "缺少平台凭据" }, { status: 400 });
      if (!provider.resolveFromCredentials)
        return Response.json({ error: "该平台未实现凭据解析" }, { status: 400 });
      const { profile, credentials } = await provider.resolveFromCredentials(data.credentials);
      const { workspace } = await getWorkspaceContext();
      const existing = await db.socialChannel.findFirst({
        where: {
          workspaceId: workspace.id,
          platform: provider.id,
          profileId: profile.id,
        },
      });
      const values = {
        platform: provider.id,
        kind: provider.kind,
        name: data.name || profile.name,
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
      const row = existing
        ? await db.socialChannel.update({ where: { id: existing.id }, data: values })
        : await db.socialChannel.create({
            data: { ...values, workspaceId: workspace.id },
          });
      const { encryptedAccessToken, encryptedRefreshToken, ...safe } = row;
      return Response.json({ ...safe, hasToken: true });
    }
    // OAuth 类：返回授权链接（前端跳转新窗口）
    if (!provider.generateAuthUrl)
      return Response.json({ error: "该平台未实现授权链接" }, { status: 400 });
    const origin =
      request.headers.get("origin") ||
      process.env.FRONTEND_URL ||
      `http://${request.headers.get("host") || "localhost:3001"}`;
    const redirectUri = `${origin}/api/social/channels/callback?platform=${provider.id}`;
    const { url, state } = await provider.generateAuthUrl(redirectUri);
    return Response.json({ authUrl: url, state });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "频道保存失败" },
      { status: 400 },
    );
  }
}
