
// 平台接入统一接口 —— 每个平台一个文件，纯 fetch 实现，不引入重量级 SDK。
// 类型与数据都保持 JSON 友好，方便存入 Prisma Json 字段。

export type SocialProviderKind = "OAUTH1" | "OAUTH2" | "TOKEN";

export type PublishMedia = {
  // 本地私有路径（/uploads/private/...）或公开 URL
  path: string;
  contentType?: string;
};

export type PublishResult = {
  platformPostId: string;
  releaseUrl?: string;
};

export type ChannelProfile = {
  id: string;
  name: string;
  username?: string;
  picture?: string;
  // 平台特有字段（如 Facebook pages 列表）
  metadata?: Record<string, unknown>;
};

export type ChannelCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // 秒
  scope?: string;
};

export interface SocialProvider {
  id: string;
  name: string;
  kind: SocialProviderKind;
  /** OAuth 跳转说明（用于授权前弹窗/新窗口），TOKEN 类返回空 */
  connectHint: string;
  /** 需要哪些环境变量（用于 UI 提示缺失配置） */
  requiredEnv: string[];
  /**
   * TOKEN 类平台：校验凭据并换取账号信息 + 可用于发布的访问凭据
   * 参数为 UI 表单提交的原始凭据（如 bluesky 传 identifier:appPassword）
   */
  resolveFromCredentials?(raw: string): Promise<{
    profile: ChannelProfile;
    credentials: ChannelCredentials;
  }>;
  /**
   * OAUTH 类平台：生成授权链接。
   * state 编码回调恢复所需信息（redirectUri / codeVerifier 等），
   * 回调时原样返回，provider 自行解码。
   */
  generateAuthUrl?(redirectUri: string): Promise<{
    url: string;
    state: string;
  }>;
  /**
   * OAUTH 类平台：回调换 token 并取回账号信息。
   * code 为平台授权码（X 为 oauth_verifier），state 由 generateAuthUrl 产生。
   */
  handleCallback?(
    code: string,
    state: string,
  ): Promise<{ profile: ChannelProfile; credentials: ChannelCredentials }>;
  /**
   * 发布帖子。content 为纯文本（各平台限制由 UI/后端提前校验）。
   */
  publish(
    credentials: ChannelCredentials,
    content: string,
    media: PublishMedia[],
    profile: ChannelProfile,
  ): Promise<PublishResult>;
}
