import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// YouTube —— OAuth2.0（Google Cloud Console）。
// 环境变量：YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / FRONTEND_URL
const AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}（Google Cloud 应用配置）`);
  return value;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json: T & { error?: { message?: string } } = {} as T & { error?: { message?: string } };
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`YouTube 返回了无法解析的响应（HTTP ${response.status}）`);
    }
  }
  if (!response.ok || (json as { error?: unknown }).error)
    throw new Error(`YouTube 请求失败：${(json as { error?: { message?: string } }).error?.message || response.status}`);
  return json;
}

export const youtubeProvider: SocialProvider = {
  id: "youtube",
  name: "YouTube",
  kind: "OAUTH2",
  connectHint:
    "通过 Google Cloud Console 授权（OAuth 2.0，scope 需包含 youtube.upload / youtube.force-ssl）。",
  requiredEnv: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const state = Buffer.from(`${redirectUri}|${Date.now().toString(36)}`).toString("base64url");
    const params = new URLSearchParams({
      client_id: env("YOUTUBE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
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
      client_id: env("YOUTUBE_CLIENT_ID"),
      client_secret: env("YOUTUBE_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    });
    const tokenJson = (await jsonFetch<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    }>(TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    }));
    if (!tokenJson.access_token) throw new Error("YouTube 未返回访问令牌");
    // 取频道信息
    const channel = await jsonFetch<{
      items?: Array<{
        id?: string;
        snippet?: { title?: string; thumbnails?: { default?: { url?: string } } };
      }>;
    }>(`${API}/youtube/v3/channels?part=snippet&mine=true`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const item = channel.items?.[0];
    if (!item?.id) throw new Error("YouTube 未能获取频道信息");
    return {
      profile: {
        id: item.id,
        name: item.snippet?.title || "YouTube 频道",
        username: "",
        picture: item.snippet?.thumbnails?.default?.url || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token,
        expiresIn: tokenJson.expires_in,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    _profile: ChannelProfile,
  ): Promise<PublishResult> {
    if (!media.length) throw new Error("YouTube 需要至少 1 个视频");
    const item = media[0];
    if (!/^https?:\/\//.test(item.path))
      throw new Error("YouTube 需要公开可访问的视频 URL（当前仅支持 http/https）");
    // 拉取远端视频字节后做 resumable 上传（简化：一次上传）
    const videoResponse = await fetch(item.path, {
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
    if (!videoResponse.ok) throw new Error(`无法读取视频：${item.path}`);
    const bytes = new Uint8Array(await videoResponse.arrayBuffer());
    const size = bytes.byteLength;
    if (size > 256 * 1024 * 1024) throw new Error("视频超过 256MB 上限（请压缩后重试）");
    const title = content.split("\n")[0].slice(0, 100) || "Untitled";
    const description = content.slice(0, 5000);
    // 1) 初始化 resumable 会话
    const init = await fetch(
      `${API}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          snippet: { title, description },
          status: { privacyStatus: "unlisted" },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    const location = init.headers.get("location");
    if (!init.ok || !location) throw new Error("YouTube 上传会话创建失败");
    // 2) 上传字节
    const upload = await fetch(location, {
      method: "PUT",
      headers: { "Content-Type": "video/*", "Content-Length": String(size) },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(300_000),
    });
    const uploadJson = (await upload.json()) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !uploadJson.id)
      throw new Error(`YouTube 上传失败：${uploadJson.error?.message || upload.status}`);
    return {
      platformPostId: uploadJson.id,
      releaseUrl: `https://www.youtube.com/watch?v=${uploadJson.id}`,
    } satisfies PublishResult;
  },
};
