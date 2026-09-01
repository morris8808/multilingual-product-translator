import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getJofshopConfig } from "@/lib/jofshop-config";
import { decryptJofshopToken, encryptJofshopToken, jofshopRequest, jofshopSkillRequest, normalizeApiBaseUrl } from "@/lib/jofshop";

type ApiResponse = { code?: number; message?: string; data?: { list?: Array<Record<string, unknown>>; total?: number } };

async function manager() {
  const context = await getWorkspaceContext();
  if (!["ADMIN", "DEVELOPER"].includes(context.user.role)) throw new Error("FORBIDDEN");
  return context;
}

export async function GET() {
  try { const { workspace } = await manager(); const config = await getJofshopConfig(workspace.id); return Response.json({ enabled: config.enabled, enforceLogin: config.enforceLogin, apiBaseUrl: config.apiBaseUrl, siteAdminUrl: config.siteAdminUrl, hasSkillToken: Boolean(config.encryptedSkillToken) }); }
  catch { return Response.json({ error: "没有权限读取登录设置" }, { status: 403 }); }
}

export async function PUT(request: Request) {
  try {
    const { workspace } = await manager();
    const input = await request.json() as { enabled?: boolean; enforceLogin?: boolean; apiBaseUrl?: string; siteAdminUrl?: string; skillToken?: string };
    const current = await getJofshopConfig(workspace.id);
    const value = { enabled: input.enabled !== false, enforceLogin: Boolean(input.enforceLogin), apiBaseUrl: normalizeApiBaseUrl(input.apiBaseUrl || "https://www.brxshop.com/apiadmin/api"), siteAdminUrl: normalizeApiBaseUrl(input.siteAdminUrl || "https://www.brxshop.com/apiadmin"), encryptedSkillToken: input.skillToken?.trim() ? encryptJofshopToken(input.skillToken.trim()) : current.encryptedSkillToken };
    await db.workspaceSetting.upsert({ where: { workspaceId_key: { workspaceId: workspace.id, key: "jofshopAuth" } }, update: { value }, create: { workspaceId: workspace.id, key: "jofshopAuth", value } });
    return Response.json({ enabled: value.enabled, enforceLogin: value.enforceLogin, apiBaseUrl: value.apiBaseUrl, siteAdminUrl: value.siteAdminUrl, hasSkillToken: Boolean(value.encryptedSkillToken) });
  } catch (error) { return Response.json({ error: error instanceof Error && error.message === "FORBIDDEN" ? "没有权限修改登录设置" : "保存失败" }, { status: 403 }); }
}

export async function POST() {
  try {
    const { user, workspace } = await manager();
    const config = await getJofshopConfig(workspace.id);
    let result: ApiResponse | null = null;
    let source = "skill";
    let warning = "";
    if (config.encryptedSkillToken) {
      try {
        result = await jofshopSkillRequest<ApiResponse>(config, "/api/skill/system-user/get-user-list?pageNum=1&pageSize=999");
        if (result.code !== 200) throw new Error(result.message || "Skill 用户接口返回失败");
      } catch (error) {
        warning = error instanceof Error ? error.message : "Skill 用户接口不可用";
      }
    }
    if (!result || result.code !== 200) {
      const accountWithToken = user.encryptedExternalToken
        ? user
        : await db.user.findFirst({
            where: { authSource: "JOFSHOP", encryptedExternalToken: { not: null }, memberships: { some: { workspaceId: workspace.id } } },
            orderBy: [{ role: "desc" }, { lastSyncedAt: "desc" }],
          });
      if (accountWithToken?.encryptedExternalToken) {
        result = await jofshopRequest<ApiResponse>(config, "/mainmanager/account/list?pageNum=1&pageSize=999", { method: "GET" }, decryptJofshopToken(accountWithToken.encryptedExternalToken));
        source = "admin-session";
      }
    }
    if (!result) return Response.json({ error: "请配置服务端 Skill Token，或使用具备用户管理权限的 JOFSHOP 账号登录" }, { status: 409 });
    if (result?.code !== 200) throw new Error(result?.message || "用户列表同步失败");
    const list = result.data?.list || [];
    for (const item of list) {
      const externalId = String(item.id ?? item.account_id ?? item.uid ?? item.username ?? "");
      if (!externalId) continue;
      const username = String(item.username ?? item.account ?? externalId);
      const email = String(item.email || (username.includes("@") ? username : `${encodeURIComponent(username)}@jofshop.local`));
      const externalStatus = Number(item.status) === 2 ? "DISABLED" : "ACTIVE";
      const synced = await db.user.upsert({ where: { authSource_externalId: { authSource: "JOFSHOP", externalId } }, update: { name: String(item.nickname ?? item.name ?? username), externalUsername: username, externalStatus, lastSyncedAt: new Date() }, create: { email, name: String(item.nickname ?? item.name ?? username), authSource: "JOFSHOP", externalId, externalUsername: username, externalStatus, lastSyncedAt: new Date(), preferences: { create: {} } } });
      await db.membership.upsert({ where: { userId_workspaceId: { userId: synced.id, workspaceId: workspace.id } }, update: {}, create: { userId: synced.id, workspaceId: workspace.id, role: "member" } });
    }
    return Response.json({ synced: list.length, total: result.data?.total ?? list.length, source, warning: source === "admin-session" && warning ? "Skill 接口暂不可用，已自动改用超级账户后台接口完成同步" : "" });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "用户同步失败" }, { status: 502 }); }
}
