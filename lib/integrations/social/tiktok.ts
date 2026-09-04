import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// TikTok —— OAuth2.0（TikTok for Developers）。
// 环境变量：TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET / FRONTEND_URL
const AUTH = "https://www.tiktok.com/v2/auth/authorize";
const API = "https://open.tiktokapis.com/v2";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}（TikTok Developer 应用配置）`);
  return value;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await response.json()) as T & {
    error?: { code?: string; message?: string };
    message?: string;
  };
  if (!response.ok || json.error)
    throw new Error(`TikTok 请求失败：${json.error?.message || json.message || response.status}`);
  return json;
}

export const tiktokProvider: SocialProvider = {
  id: "tiktok",
  name: "TikTok",
  kind: "OAUTH2",
  connectHint:
    "通过 TikTok for Developers 应用授权（需 video.publish 与 user.info.basic 权限）。",
  requiredEnv: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const state = Buffer.from(`${redirectUri}|${Date.now().toString(36)}`).toString("base64url");
    const params = new URLSearchParams({
      client_key: env("TIKTOK_CLIENT_KEY"),
      response_type: "code",
      scope: "user.info.basic,video.publish",
      redirect_uri: redirectUri,
      state,
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
    const tokenBody = new URLSearchParams({
      client_key: env("TIKTOK_CLIENT_KEY"),
      client_secret: env("TIKTOK_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const tokenResponse = await fetch(`${API}/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const tokenJson = (await tokenResponse.json()) as {
      data?: { access_token?: string; expires_in?: number; open_id?: string; refresh_token?: string };
      error?: { message?: string };
    };
    const data = tokenJson.data;
    if (!tokenResponse.ok || !data?.access_token)
      throw new Error(`TikTok 授权失败：${tokenJson.error?.message || tokenResponse.status}`);
    const me = await jsonFetch<{
      data?: { user?: { open_id?: string; display_name?: string; avatar_url?: string; username?: string } };
    }>(`${API}/user/info/?fields=open_id,display_name,avatar_url,username`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const user = me.data?.user;
    if (!user?.open_id)
      throw new Error("TikTok 未能获取用户信息");
    return {
      profile: {
        id: user.open_id,
        name: user.display_name || user.username || "TikTok 用户",
        username: user.username || user.display_name || "",
        picture: user.avatar_url || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    if (!media.length) throw new Error("TikTok 需要至少 1 个视频");
    const item = media[0];
    if (!/^https?:\/\//.test(item.path))
      throw new Error("TikTok 需要公开可访问的视频 URL（当前仅支持 http/https）");
    // 发起视频发布任务（PULL_FROM_URL）
    const init = await jsonFetch<{
      data?: { publish_id?: string };
    }>(`${API}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: content.slice(0, 2200),
          privacy_level: "SELF_ONLY",
          disable_comment: false,
          disable_duet: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: item.path,
        },
      }),
    });
    const publishId = init.data?.publish_id;
    if (!publishId) throw new Error("TikTok 发布任务创建失败");
    // 轮询发布状态（简化：等待短时间返回，实际效果由 TikTok 异步处理）
    await new Promise((resolve) => setTimeout(resolve, 8000));
    const status = await jsonFetch<{
      data?: { status?: string; fail_reason?: string; publish_result?: { video?: { id?: string } } };
    }>(`${API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });
    const st = status.data?.status;
    if (st === "FAILED")
      throw new Error(`TikTok 发布失败：${status.data?.fail_reason || "未知原因"}`);
    const videoId = status.data?.publish_result?.video?.id;
    return {
      platformPostId: videoId || publishId,
      releaseUrl: videoId ? `https://www.tiktok.com/@${profile.username || "video"}/video/${videoId}` : "",
    } satisfies PublishResult;
  },
};
