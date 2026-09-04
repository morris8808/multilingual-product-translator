import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`平台返回了无法解析的响应（HTTP ${response.status}）`);
    }
  }
  if (!response.ok) {
    const message = (payload as { errors?: string[] })?.errors?.join("; ") || `HTTP ${response.status}`;
    throw new Error(`Medium 请求失败：${message}`);
  }
  return payload as T;
}

const MEDIUM_API = "https://api.medium.com/v1";

// Medium 免开发者应用：Integration Token 即可发布（settings → Security tokens）。
export const mediumProvider: SocialProvider = {
  id: "medium",
  name: "Medium",
  kind: "TOKEN",
  connectHint:
    "填入 Medium Integration Token（Medium 设置 → Security and apps → Integration tokens 生成）。",
  requiredEnv: [],
  async resolveFromCredentials(raw: string) {
    const token = raw.trim();
    if (!token) throw new Error("请填写 Medium Integration Token");
    const me = await request<{ data: { id: string; name: string; username?: string; imageUrl?: string } }>(
      `${MEDIUM_API}/me`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return {
      profile: {
        id: me.data.id,
        name: me.data.name,
        username: me.data.username || "",
        picture: me.data.imageUrl || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: token,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    _media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    const created = await request<{
      data: { id: string; url?: string; canonicalUrl?: string };
    }>(`${MEDIUM_API}/users/${profile.id}/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: content.split("\n")[0].slice(0, 100) || "Untitled",
        contentFormat: "markdown",
        content,
        publishStatus: "public",
      }),
    });
    return {
      platformPostId: created.data.id,
      releaseUrl: created.data.url || created.data.canonicalUrl || "",
    } satisfies PublishResult;
  },
};
