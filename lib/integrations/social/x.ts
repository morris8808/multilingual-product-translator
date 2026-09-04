import { createHmac, randomBytes } from "node:crypto";
import type {
  ChannelProfile,
  ChannelCredentials,
  PublishMedia,
  PublishResult,
  SocialProvider,
} from "./types";

// X (Twitter) —— OAuth1.0a。需要 X Developer App（API Key/Secret）。
// 环境变量：X_API_KEY / X_API_SECRET / FRONTEND_URL（回调前缀）
const API = "https://api.x.com/1.1";
const OAUTH = "https://api.x.com/oauth";

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少 ${name}（X Developer 应用配置）`);
  return value;
}

const pct = (s: string) =>
  encodeURIComponent(s)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

function signatureBase(method: string, url: string, params: Record<string, string>) {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${pct(k)}=${pct(params[k])}`)
    .join("&");
  return [method.toUpperCase(), pct(url.split("?")[0]), pct(sorted)].join("&");
}

function oauthHeader(
  method: string,
  url: string,
  token: string,
  tokenSecret: string,
  extra: Record<string, string> = {},
) {
  const params: Record<string, string> = {
    oauth_consumer_key: env("X_API_KEY"),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_token: token,
    oauth_version: "1.0",
    ...extra,
  };
  const signingKey = `${pct(env("X_API_SECRET"))}&${pct(tokenSecret)}`;
  params.oauth_signature = createHmac("sha1", signingKey)
    .update(signatureBase(method, url, params))
    .digest("base64");
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${pct(k)}="${pct(params[k])}"`)
      .join(", ")
  );
}

// 无 token 的请求（request_token 阶段）
function oauthHeaderAppOnly(method: string, url: string, extra: Record<string, string> = {}) {
  const params: Record<string, string> = {
    oauth_consumer_key: env("X_API_KEY"),
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extra,
  };
  const signingKey = `${pct(env("X_API_SECRET"))}&`;
  params.oauth_signature = createHmac("sha1", signingKey)
    .update(signatureBase(method, url, params))
    .digest("base64");
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${pct(k)}="${pct(params[k])}"`)
      .join(", ")
  );
}

async function postForm(url: string, header: string, bodyParams: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(bodyParams),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));
  if (!response.ok || parsed.oauth_problem || parsed.errors)
    throw new Error(
      `X 请求失败：${parsed.oauth_problem || (text.length < 200 ? text : `HTTP ${response.status}`)}`,
    );
  return parsed;
}

export const xProvider: SocialProvider = {
  id: "x",
  name: "X (Twitter)",
  kind: "OAUTH1",
  connectHint: "通过 X Developer 应用授权登录当前 X 账号。",
  requiredEnv: ["X_API_KEY", "X_API_SECRET", "FRONTEND_URL"],
  async generateAuthUrl(redirectUri: string) {
    const requestToken = await postForm(
      `${OAUTH}/request_token`,
      oauthHeaderAppOnly("POST", `${OAUTH}/request_token`, {
        oauth_callback: redirectUri,
      }),
    );
    const oauthToken = requestToken.oauth_token || "";
    const oauthTokenSecret = requestToken.oauth_token_secret || "";
    // state 编码 oauth_token + secret（回调只回传 state，无法带额外参数）
    const state = Buffer.from(`${oauthToken}|${oauthTokenSecret}`).toString("base64url");
    return {
      url: `${OAUTH}/authorize?oauth_token=${encodeURIComponent(oauthToken)}`,
      state,
    };
  },
  async handleCallback(code: string, state: string) {
    // code = oauth_verifier；state = base64(oauth_token|oauth_token_secret)
    let oauthToken = "";
    let oauthTokenSecret = "";
    try {
      const decoded = Buffer.from(state, "base64url").toString();
      const parts = decoded.split("|");
      oauthToken = parts[0] || "";
      oauthTokenSecret = parts[1] || "";
    } catch {
      throw new Error("授权状态无效，请重新发起连接");
    }
    if (!oauthToken || !oauthTokenSecret || !code)
      throw new Error("缺少 OAuth 会话信息，请重新授权");
    const access = await postForm(
      `${OAUTH}/access_token`,
      oauthHeader("POST", `${OAUTH}/access_token`, oauthToken, oauthTokenSecret),
      { oauth_token: oauthToken, oauth_verifier: code },
    );
    const accessToken = access.oauth_token || "";
    const accessSecret = access.oauth_token_secret || "";
    if (!accessToken) throw new Error("X 未返回访问令牌");
    const meUrl = "https://api.x.com/1.1/account/verify_credentials.json";
    const response = await fetch(meUrl, {
      headers: {
        Authorization: oauthHeader("GET", meUrl, accessToken, accessSecret),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const me = (await response.json()) as {
      id_str?: string;
      screen_name?: string;
      name?: string;
      profile_image_url_https?: string;
    };
    if (!response.ok || !me.id_str) throw new Error("X 账号信息获取失败");
    return {
      profile: {
        id: me.id_str,
        name: me.name || me.screen_name || "",
        username: me.screen_name || "",
        picture: me.profile_image_url_https || "",
      } satisfies ChannelProfile,
      credentials: {
        accessToken: `${accessToken}:${accessSecret}`,
      } satisfies ChannelCredentials,
    };
  },
  async publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult> {
    const [token, tokenSecret] = credentials.accessToken.split(":");
    if (!token || !tokenSecret) throw new Error("X 频道凭据不完整，请重新连接");
    const mediaIds: string[] = [];
    for (const item of media.slice(0, 4)) {
      const mediaResponse = await fetch(item.path, {
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      if (!mediaResponse.ok) throw new Error(`无法读取媒体：${item.path}`);
      const bytes = Buffer.from(await mediaResponse.arrayBuffer());
      const boundary = `----wb${randomBytes(8).toString("hex")}`;
      const url = `${API}/media/upload.json`;
      const header = oauthHeader("POST", url, token, tokenSecret);
      const head = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="media"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      );
      const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
      const upload = await fetch(url, {
        method: "POST",
        headers: { Authorization: header, "Content-Type": `multipart/form-data; boundary=${boundary}` },
        body: Buffer.concat([head, bytes, tail]),
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const json = (await upload.json()) as { media_id_string?: string; errors?: Array<{ message?: string }> };
      if (!upload.ok || !json.media_id_string)
        throw new Error(`X 媒体上传失败：${json.errors?.map((e) => e.message).join("; ") || upload.status}`);
      mediaIds.push(json.media_id_string);
    }
    const tweetUrl = "https://api.x.com/2/tweets";
    const response = await fetch(tweetUrl, {
      method: "POST",
      headers: {
        Authorization: oauthHeader("POST", tweetUrl, token, tokenSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: content.slice(0, 280),
        ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await response.json()) as { data?: { id: string }; errors?: Array<{ message?: string }> };
    if (!response.ok || !json.data)
      throw new Error(`X 发布失败：${json.errors?.map((e) => e.message).join("; ") || response.status}`);
    return {
      platformPostId: json.data.id,
      releaseUrl: `https://x.com/${profile.username || "i/web"}/status/${json.data.id}`,
    } satisfies PublishResult;
  },
};
