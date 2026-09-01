import "server-only";
import { decryptCredential } from "@/lib/crypto";

export type FecifyConnection = { apiUrl: string; encryptedToken: string };
function base(value: string) {
  return value.replace(/\/$/, "");
}
async function request<T>(
  connection: FecifyConnection,
  path: string,
  init?: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(`${base(connection.apiUrl)}${path}`, {
      ...init,
      headers: {
        "skill-access-token": decryptCredential(connection.encryptedToken),
        Accept: "application/json",
        ...init?.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    const reason = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "请求超时" : "网络连接失败";
    throw new Error(`${reason}：无法访问 JOFSHOP API ${base(connection.apiUrl)}，请检查 API 地址、网络和证书`);
  }
  const raw = await response.text();
  let payload: {
    code?: number;
    message?: string;
    data?: T;
  } = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as typeof payload;
    } catch {
      throw new Error(`JOFSHOP 返回了无法识别的响应（HTTP ${response.status}），请检查 API 地址是否填写正确`);
    }
  }
  if (!response.ok || payload.code !== 200)
    throw new Error(payload.message || `JOFSHOP 返回 ${response.status}`);
  return payload.data as T;
}
export async function listFecifyProducts(
  connection: FecifyConnection,
  page: number,
  pageSize: number,
  title?: string,
) {
  const query = new URLSearchParams({
    pageNum: String(page),
    pageSize: String(pageSize),
  });
  if (title) query.set("title", title);
  return request<{
    list?: Array<Record<string, unknown>>;
    total?: number;
    totalPage?: number;
  }>(connection, `/api/skill/product/list?${query}`);
}
export async function getFecifyProduct(
  connection: FecifyConnection,
  productId: string,
) {
  return request<Record<string, unknown>>(
    connection,
    `/api/skill/product/info?${new URLSearchParams({ id: productId })}`,
  );
}

export async function getFecifyLanguages(connection: FecifyConnection) {
  const data = await request<unknown>(
    connection,
    "/api/skill/base/get-shop-languages",
    { method: "POST" },
  );
  const root =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const source = Array.isArray(data)
    ? data
    : Array.isArray(root.list)
      ? root.list
      : Array.isArray(root.languages)
        ? root.languages
        : Array.isArray(root.language_list)
          ? root.language_list
          : Array.isArray(root.shop_language_list)
            ? root.shop_language_list
            : [];
  const languages = source
    .map((item) => {
      if (typeof item === "string")
        return { code: item, name: item, enabled: true, isDefault: false };
      const row = item as Record<string, unknown>;
      const code = String(
        row.code ?? row.lang_code ?? row.language_code ?? row.locale ?? "",
      );
      return {
        code,
        name: String(row.name ?? row.lang_name ?? row.language_name ?? code),
        enabled: row.enabled !== false && row.status !== 0,
        isDefault: Boolean(row.is_default ?? row.default ?? row.isDefault),
      };
    })
    .filter((item) => item.code);
  const baseLanguage = String(
    root.default_language ??
      root.base_language ??
      root.shop_base_language_code ??
      languages.find((item) => item.isDefault)?.code ??
      "",
  );
  return { baseLanguage, languages };
}
export async function publishFecifyProductTranslations(
  connection: FecifyConnection,
  productId: string,
  translations: Array<Record<string, string>>,
) {
  const normalizedTranslations = translations.map((translation) => {
    const language =
      translation.lang_code ||
      translation.language_code ||
      translation.code ||
      "";
    const { language_code: _languageCode, code: _code, ...fields } =
      translation;
    return { ...fields, lang_code: language };
  });
  return request<Record<string, unknown>>(
    connection,
    "/api/skill/addons-language/save-product-translate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: productId,
        product_translate: normalizedTranslations,
      }),
    },
  );
}

export const FECIFY_CONTENT_ENTITIES = {
  collections: {
    list: "/api/skill/product-collection/list",
    idKey: "collection_id",
    save: "/api/skill/addons-language/save-collection-translate",
    root: "collection_translate",
  },
  articles: {
    list: "/api/skill/blog-article/list",
    idKey: "article_id",
    save: "/api/skill/addons-language/save-blog-article-translate",
    root: "blog_article_translate",
  },
  "blog-collections": {
    list: "/api/skill/blog-collection/list",
    idKey: "collection_id",
    save: "/api/skill/addons-language/save-blog-collection-translate",
    root: "blog_collection_translate",
  },
  pages: {
    list: "/api/skill/page/list",
    idKey: "page_id",
    save: "/api/skill/addons-language/save-page-translate",
    root: "page_translate",
  },
} as const;

export type FecifyContentEntity = keyof typeof FECIFY_CONTENT_ENTITIES | "site";

export async function listFecifyContent(
  connection: FecifyConnection,
  entity: FecifyContentEntity,
  page = 1,
  pageSize = 100,
) {
  if (entity === "site") {
    const data = await request<Record<string, unknown>>(
      connection,
      "/api/skill/addons-language/get-site-seo-translate",
    );
    const source = (data.site_seo_data || data.seo_data || data) as Record<
      string,
      unknown
    >;
    return { list: [{ id: "home", ...source }], totalPage: 1 };
  }
  const config = FECIFY_CONTENT_ENTITIES[entity];
  const query = new URLSearchParams({
    pageNum: String(page),
    pageSize: String(pageSize),
  });
  const data = await request<{
    list?: Array<Record<string, unknown>>;
    totalPage?: number;
  }>(connection, `${config.list}?${query}`, { method: "POST" });
  return { list: data?.list || [], totalPage: Number(data?.totalPage || 1) };
}

export async function publishFecifyContentTranslations(
  connection: FecifyConnection,
  entity: FecifyContentEntity,
  sourceId: string,
  translations: Array<Record<string, string>>,
) {
  if (entity === "site")
    return request<Record<string, unknown>>(
      connection,
      "/api/skill/addons-language/set-site-seo-translate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_seo_translate: translations }),
      },
    );
  const config = FECIFY_CONTENT_ENTITIES[entity];
  return request<Record<string, unknown>>(connection, config.save, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      [config.idKey]: sourceId,
      [config.root]: translations,
    }),
  });
}
