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
    const message =
      (payload as { error?: string })?.error ||
      (payload as { error_description?: string })?.error_description ||
      `HTTP ${response.status}`;
    throw new Error(`Mastodon 请求失败：${message}`);
  }
  return payload as T;
}

// Mastodon 免开发者应用：填实例地址 + 访问令牌即可。
// 令牌可在 实例 → 偏好 → 开发 → 新建应用 中生成。
export const mastodonProvider: SocialProvider = {
  id: "mastodon",
  name: "Mastodon",
  kind: "TOKEN",
  connectHint:
    "填入实例地址（如 https://mastodon.social）和访问令牌。令牌在实例「偏好 → 开发 → 新建应用」里生成（需读+写权限）。",
  requiredEnv: [],
  async resolveFromCredentials(raw: string) {
    // 实例地址含 https:// 冒号，用最后一个冒号分割（token 不含冒号）
    const sep = raw.lastIndexOf(":");
    if (sep <= 0)
      throw new Error("请按「实例地址:访问令牌」格式填写 Mastodon 凭据");
    const instance = raw.slice(0, sep).trim();
    const token = raw.slice(sep + 1).trim();
    if (!instance || !token)
      throw new Error("请按「实例地址:访问令牌」格式填写 Mastodon 凭据");
    const base = instance.replace(/\/$/, "");
    const me = await request<{
      id: string;
      username: string;
      display_name?: string;
      avatar?: string;
    }>(`${base}/api/v1/accounts/verify_credentials`, {
      headers: { Authorization: `Bearer ${token.trim()}` },
    });
    return {
      profile: {
        id: me.id,
        name: me.display_name || me.username,
        username: me.username,
        picture: me.avatar || "",
        metadata: { instance: base },
      } satisfies ChannelProfile,
      credentials: {
        accessToken: token.trim(),
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    const base = (profile.metadata as { instance?: string } | null)?.instance;
    if (!base) throw new Error("频道缺少实例地址，请重新连接");
    const form = new FormData();
    form.append("status", content.slice(0, 500));
    form.append("visibility", "public");
    for (const item of media.slice(0, 4)) {
      const response = await fetch(item.path, {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`无法读取媒体：${item.path}`);
      const bytes = await response.arrayBuffer();
      form.append("media[]", new Blob([bytes]), "media");
    }
    const created = await request<{ id: string; url?: string }>(
      `${base}/api/v1/statuses`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        body: form,
      },
    );
    return {
      platformPostId: created.id,
      releaseUrl: created.url || "",
    } satisfies PublishResult;
  },
};
