import { decryptCredential, encryptCredential } from "@/lib/crypto";

export type JofshopConfig = {
  enabled: boolean;
  enforceLogin: boolean;
  apiBaseUrl: string;
  siteAdminUrl: string;
  encryptedSkillToken?: string;
};

export const DEFAULT_JOFSHOP_CONFIG: JofshopConfig = {
  enabled: true,
  enforceLogin: false,
  apiBaseUrl: "https://www.brxshop.com/apiadmin/api",
  siteAdminUrl: "https://www.brxshop.com/apiadmin",
};

export function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

export async function jofshopRequest<T>(
  config: JofshopConfig,
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  let response: Response;
  try { response = await fetch(`${normalizeApiBaseUrl(config.apiBaseUrl)}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "client-type": "20",
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "access-token": token } : {}),
      ...init.headers,
    },
  }); } catch { throw new Error("无法连接 JOFSHOP 服务端，请检查网络或服务地址"); }
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) throw new Error(`JOFSHOP 服务请求失败（${response.status}）`);
  return data;
}

export function encryptJofshopToken(token: string) { return encryptCredential(token); }
export function decryptJofshopToken(token: string) { return decryptCredential(token); }

export async function jofshopSkillRequest<T>(
  config: JofshopConfig,
  path: string,
  init: RequestInit = {},
) {
  if (!config.encryptedSkillToken) throw new Error("尚未配置服务端 Skill Token");
  const base = normalizeApiBaseUrl(config.siteAdminUrl);
  let response: Response;
  try { response = await fetch(`${base}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "skill-access-token": decryptJofshopToken(config.encryptedSkillToken),
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  }); } catch { throw new Error("无法连接 JOFSHOP 服务端，请检查网络或服务地址"); }
  const raw = await response.text();
  let data: T;
  try { data = JSON.parse(raw) as T; }
  catch { throw new Error(raw.includes("internal server error") ? "JOFSHOP 服务端用户接口发生内部错误" : `JOFSHOP 返回了无法识别的响应（${response.status}）`); }
  if (!response.ok) throw new Error(`JOFSHOP 服务请求失败（${response.status}）`);
  return data;
}
