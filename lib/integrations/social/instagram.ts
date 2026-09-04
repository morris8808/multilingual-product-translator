import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// Instagram —— OAuth2.0（Meta App，需绑定 FB 主页的 Business/Creator 账号）。
// 与 Facebook 共用同一 Meta 开发者应用。
// 环境变量：FACEBOOK_CLIENT_ID / FACEBOOK_CLIENT_SECRET / FRONTEND_URL
const AUTH = "https://www.facebook.com/v21.0/dialog/oauth";
const GRAPH = "https://graph.facebook.com/v21.0";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}（Meta Developer 应用配置）`);
  return value;
}

async function graph<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  const url = path.includes("?")
    ? `${GRAPH}/${path}&access_token=${encodeURIComponent(accessToken)}`
    : `${GRAPH}/${path}?access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok || (json as { error?: unknown }).error)
    throw new Error(`Instagram 请求失败：${(json as { error?: { message?: string } }).error?.message || response.status}`);
  return json;
}

export const instagramProvider: SocialProvider = {
  id: "instagram",
  name: "Instagram",
  kind: "OAUTH2",
  connectHint:
    "通过 Meta Developer 应用授权。需要将你的 Instagram 账号转为「创作者/商家账号」并绑定到 Facebook 主页。",
  requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const state = Buffer.from(`${redirectUri}|${Date.now().toString(36)}`).toString("base64url");
    const params = new URLSearchParams({
      client_id: env("FACEBOOK_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "instagram_basic instagram_content_publish pages_show_list",
      response_type: "code",
    });
    return { url: `${AUTH}?${params}`, state };
  },
  async handleCallback(code: string, state: string) {
    let redirectUri = "";
    try {
      redirectUri = Buffer.from(state, "base64url").toString().split("|")[0] || "";
    } catch {
      redirectUri = "";
    }
    if (!redirectUri) throw new Error("授权状态无效，请重新发起连接");
    const tokenResponse = await fetch(
      `${GRAPH}/oauth/access_token?client_id=${env("FACEBOOK_CLIENT_ID")}&client_secret=${env(
        "FACEBOOK_CLIENT_SECRET",
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`,
      { cache: "no-store", signal: AbortSignal.timeout(30_000) },
    );
    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      error?: { message?: string };
    };
    if (!tokenResponse.ok || !tokenJson.access_token)
      throw new Error(`Instagram 授权失败：${tokenJson.error?.message || tokenResponse.status}`);
    // 在账号主页列表中找绑定了 Instagram 商业账号的主页
    const accounts = await graph<{
      data?: Array<{
        id: string;
        name: string;
        access_token?: string;
        instagram_business_account?: { id: string };
        picture?: { data?: { url?: string } };
      }>;
    }>("me/accounts?fields=id,name,access_token,instagram_business_account,picture", tokenJson.access_token);
    const page = accounts.data?.find((p) => p.instagram_business_account?.id);
    if (!page?.instagram_business_account)
      throw new Error("未找到绑定 Instagram 商业账号的 Facebook 主页。请先在 Instagram 设置中把账号转为商家账号并绑定主页。");
    // 取 Instagram 账号详情（用户名/头像）
    const ig = await graph<{ username?: string; name?: string; profile_picture_url?: string }>(
      `${page.instagram_business_account.id}?fields=username,name,profile_picture_url`,
      page.access_token || tokenJson.access_token,
    );
    return {
      profile: {
        id: page.instagram_business_account.id,
        name: ig.name || ig.username || page.name,
        username: ig.username || "",
        picture: ig.profile_picture_url || page.picture?.data?.url || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: page.access_token || tokenJson.access_token,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    const igId = profile.id;
    if (!media.length) throw new Error("Instagram 单图发布至少需要 1 张图片");
    // 先创建媒体容器（当前版本单图；支持 image_url）
    const item = media[0];
    if (!/^https?:\/\//.test(item.path))
      throw new Error("Instagram 需要公开可访问的图片 URL（当前仅支持 http/https）");
    const container = await graph<{ id?: string; error_message?: string; error?: { message?: string } }>(
      `${igId}/media`,
      credentials.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: item.path,
          caption: content.slice(0, 2200),
        }),
      },
    );
    const containerId = container.id;
    if (!containerId)
      throw new Error(`Instagram 媒体创建失败：${container.error?.message || container.error_message || "未知错误"}`);
    // 等待媒体就绪后发布
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const published = await graph<{ id?: string; error?: { message?: string } }>(
      `${igId}/media_publish`,
      credentials.accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerId }),
      },
    );
    if (!published.id)
      throw new Error(`Instagram 发布失败：${published.error?.message || "未知错误"}`);
    return {
      platformPostId: published.id,
      releaseUrl: `https://www.instagram.com/p/${published.id}/`,
    } satisfies PublishResult;
  },
};
