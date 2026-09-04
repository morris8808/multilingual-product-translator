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
      (payload as { message?: string })?.message ||
      (payload as { error?: string })?.error ||
      (payload as { error_message?: string })?.error_message ||
      `HTTP ${response.status}`;
    throw new Error(`Bluesky 请求失败：${message}`);
  }
  return payload as T;
}

// Bluesky 免开发者应用：填账号(identifier) + App Password 即可发布。
// 参考官方 atproto API（com.atproto.* / app.bsky.*）。
const ATP = "https://bsky.social";

export const blueskyProvider: SocialProvider = {
  id: "bluesky",
  name: "Bluesky",
  kind: "TOKEN",
  connectHint:
    "填入 Bluesky 用户名（如 user.bsky.social）和应用密码。应用密码在 设置 → App Passwords 生成。",
  requiredEnv: [],
  async resolveFromCredentials(raw: string) {
    const [identifier, password] = raw.split(":", 2);
    if (!identifier || !password)
      throw new Error("请按「账号:应用密码」格式填写 Bluesky 凭据");
    const session = await request<{
      accessJwt: string;
      did: string;
      handle: string;
    }>(`${ATP}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier.trim(), password: password.trim() }),
    });
    const profile = await request<{
      displayName?: string;
      avatar?: string;
    }>(`${ATP}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.did)}`, {
      headers: { Authorization: `Bearer ${session.accessJwt}` },
    });
    return {
      profile: {
        id: session.did,
        name: profile.displayName || session.handle,
        username: session.handle,
        picture: profile.avatar || "",
      } satisfies ChannelProfile,
      // Bluesky 的 session JWT 仅 2 小时有效；发布时如 401 需刷新。
      // 存储账号+AppPassword 的加密组合作为长期凭据（发布时重新 createSession）。
      credentials: {
        accessToken: `${identifier.trim()}:${password.trim()}`,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    // 重新登录拿短期 JWT（长期凭据 = 账号:AppPassword）
    const [identifier, password] = credentials.accessToken.split(":", 2);
    const session = await request<{ accessJwt: string }>(
      `${ATP}/xrpc/com.atproto.server.createSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      },
    );
    const jwt = session.accessJwt;
    // 图片需先上传拿 blob。media.path 当前版本约定为可 fetch 的 URL。
    const images = [] as { image: { $type: string; ref: { $link: string }; mimeType: string; size: number }; alt: string }[];
    for (const item of media.slice(0, 4)) {
      const response = await fetch(item.path, {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`无法读取媒体：${item.path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const upload = await request<{ blob: { $type: string; ref: { $link: string }; mimeType: string; size: number } }>(
        `${ATP}/xrpc/com.atproto.repo.uploadBlob`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwt}`,
            "Content-Type": response.headers.get("content-type") || "image/png",
          },
          body: bytes,
        },
      );
      images.push({
        image: upload.blob,
        alt: "",
      });
    }
    const record = {
      $type: "app.bsky.feed.post",
      text: content.slice(0, 300),
      createdAt: new Date().toISOString(),
      ...(images.length
        ? {
            embed: {
              $type: "app.bsky.embed.images",
              images,
            },
          }
        : {}),
    };
    const created = await request<{ uri: string; cid: string }>(
      `${ATP}/xrpc/com.atproto.repo.createRecord`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          repo: profile.id,
          collection: "app.bsky.feed.post",
          record,
        }),
      },
    );
    const rkey = created.uri.split("/").pop() || created.cid;
    return {
      platformPostId: created.uri,
      releaseUrl: `https://bsky.app/profile/${profile.username}/post/${rkey}`,
    } satisfies PublishResult;
  },
};
