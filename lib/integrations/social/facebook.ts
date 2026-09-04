import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// Facebook —— OAuth2.0（Meta App）。可发布到主页（Page）。
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
    throw new Error(`Facebook 请求失败：${(json as { error?: { message?: string } }).error?.message || response.status}`);
  return json;
}

export const facebookProvider: SocialProvider = {
  id: "facebook",
  name: "Facebook",
  kind: "OAUTH2",
  connectHint: "通过 Meta Developer 应用授权，选择要发布的主页。",
  requiredEnv: ["FACEBOOK_CLIENT_ID", "FACEBOOK_CLIENT_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const state = Buffer.from(`${redirectUri}|${Date.now().toString(36)}`).toString("base64url");
    const params = new URLSearchParams({
      client_id: env("FACEBOOK_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "pages_show_list pages_manage_posts pages_read_engagement publish_pages",
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
      expires_in?: number;
      error?: { message?: string };
    };
    if (!tokenResponse.ok || !tokenJson.access_token)
      throw new Error(`Facebook 授权失败：${tokenJson.error?.message || tokenResponse.status}`);
    // 取主页列表（发布到第一个 Page，避免个人时间线权限复杂度）
    const pages = await graph<{ data?: Array<{ id: string; name: string; access_token?: string; picture?: { data?: { url?: string } } }> }>(
      "me/accounts",
      tokenJson.access_token,
    );
    const page = pages.data?.[0];
    if (!page) throw new Error("未找到可发布的 Facebook 主页，请确认账号已创建主页");
    return {
      profile: {
        id: page.id,
        name: page.name,
        username: "",
        picture: page.picture?.data?.url || "",
        metadata: { page: true },
      } satisfies ChannelProfile,
      credentials: {
        accessToken: page.access_token || tokenJson.access_token,
        expiresIn: tokenJson.expires_in,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    const pageId = profile.id;
    if (media.length) {
      // 图片发到主页（第一张）
      const mediaResponse = await fetch(media[0].path, {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!mediaResponse.ok) throw new Error(`无法读取媒体：${media[0].path}`);
      const bytes = new Uint8Array(await mediaResponse.arrayBuffer());
      const boundary = `----wb${Math.random().toString(36).slice(2)}`;
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="source"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );
      const tail = Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${content}\r\n--${boundary}--\r\n`);
      const response = await fetch(`${GRAPH}/${pageId}/photos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: Buffer.concat([head, Buffer.from(bytes), tail]),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const json = (await response.json()) as { id?: string; post_id?: string; error?: { message?: string } };
      if (!response.ok || (!json.id && !json.post_id))
        throw new Error(`Facebook 发布失败：${json.error?.message || response.status}`);
      return {
        platformPostId: json.post_id || json.id || "",
        releaseUrl: json.post_id ? `https://www.facebook.com/${pageId}/posts/${(json.post_id as string).split("_").pop()}` : "",
      } satisfies PublishResult;
    }
    const body = {
      message: content.slice(0, 5000),
    };
    const response = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json()) as { id?: string; error?: { message?: string } };
    if (!response.ok || !json.id) throw new Error(`Facebook 发布失败：${json.error?.message || response.status}`);
    return {
      platformPostId: json.id,
      releaseUrl: `https://www.facebook.com/${pageId}/posts/${json.id.split("_").pop()}`,
    } satisfies PublishResult;
  },
};
