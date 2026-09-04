import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// LinkedIn —— OAuth2.0。需要 LinkedIn Developer App。
// 环境变量：LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / FRONTEND_URL
const AUTH = "https://www.linkedin.com/oauth/v2";
const API = "https://api.linkedin.com/v2";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}（LinkedIn Developer 应用配置）`);
  return value;
}

export const linkedinProvider: SocialProvider = {
  id: "linkedin",
  name: "LinkedIn",
  kind: "OAUTH2",
  connectHint: "通过 LinkedIn Developer 应用授权（需 w_member_social 权限）。",
  requiredEnv: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const state = Buffer.from(`${redirectUri}|${Date.now().toString(36)}`).toString("base64url");
    const params = new URLSearchParams({
      response_type: "code",
      client_id: env("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      state,
      scope: "w_member_social r_liteprofile r_emailaddress",
    });
    return { url: `${AUTH}/authorization?${params}`, state };
  },
  async handleCallback(code: string, state: string) {
    let redirectUri = "";
    try {
      redirectUri = Buffer.from(state, "base64url").toString().split("|")[0] || "";
    } catch {
      redirectUri = "";
    }
    if (!redirectUri) throw new Error("授权状态无效，请重新发起连接");
    const tokenResponse = await fetch(`${AUTH}/accessToken`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: env("LINKEDIN_CLIENT_ID"),
        client_secret: env("LINKEDIN_CLIENT_SECRET"),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const tokenJson = (await tokenResponse.json()) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!tokenResponse.ok || !tokenJson.access_token)
      throw new Error(`LinkedIn 授权失败：${tokenJson.error_description || tokenResponse.status}`);
    const meResponse = await fetch(`${API}/userinfo`, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const me = (await meResponse.json()) as {
      sub?: string;
      name?: string;
      picture?: string;
      email?: string;
    };
    return {
      profile: {
        id: me.sub || "",
        name: me.name || me.email || "LinkedIn 用户",
        username: me.email || "",
        picture: me.picture || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: tokenJson.access_token,
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
    // 简化：发纯文本分享（图片上传 LinkedIn 较复杂，先支持文本）
    const body = {
      author: `urn:li:person:${profile.id}`,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: content.slice(0, 3000) },
          shareMediaCategory: media.length ? "IMAGE" : "NONE",
        },
      },
      visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
    };
    const response = await fetch(`${API}/ugcPosts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json()) as { id?: string; message?: string };
    if (!response.ok || !json.id) throw new Error(`LinkedIn 发布失败：${json.message || response.status}`);
    return {
      platformPostId: json.id,
      releaseUrl: `https://www.linkedin.com/feed/update/${json.id}`,
    } satisfies PublishResult;
  },
};
