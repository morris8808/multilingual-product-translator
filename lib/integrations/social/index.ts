import type { SocialProvider } from "./types";
import { blueskyProvider } from "./bluesky";
import { mastodonProvider } from "./mastodon";
import { mediumProvider } from "./medium";
import { xProvider } from "./x";
import { linkedinProvider } from "./linkedin";
import { facebookProvider } from "./facebook";
import { instagramProvider } from "./instagram";
import { tiktokProvider } from "./tiktok";
import { youtubeProvider } from "./youtube";

const registry: Record<string, SocialProvider> = {};

function register(provider: SocialProvider) {
  registry[provider.id] = provider;
}

// 无需开发者应用（本地可立即验证）
register(blueskyProvider);
register(mastodonProvider);
register(mediumProvider);
// 需要开发者应用（OAuth 框架已就绪，配好环境变量即可用）
register(xProvider);
register(linkedinProvider);
register(facebookProvider);
register(instagramProvider);
register(tiktokProvider);
register(youtubeProvider);

export function getSocialProvider(id: string): SocialProvider | undefined {
  return registry[id];
}

export function listSocialProviders(): SocialProvider[] {
  return Object.values(registry).sort((a, b) => a.name.localeCompare(b.name));
}

export const SOCIAL_CATEGORY_LABELS: Record<string, string> = {
  OAUTH1: "OAuth1",
  OAUTH2: "OAuth2",
  TOKEN: "填入凭据",
};
