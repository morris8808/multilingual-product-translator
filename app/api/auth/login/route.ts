import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSessionValue, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth-session";
import { getJofshopConfig } from "@/lib/jofshop-config";
import { encryptJofshopToken, jofshopRequest } from "@/lib/jofshop";

export const runtime = "nodejs";

type ApiResponse<T> = { code?: number; message?: string; data?: T };

export async function POST(request: Request) {
  try {
    const input = await request.json() as { username?: string; password?: string; captcha?: string; captchaKey?: string };
    if (!input.username || !input.password) return Response.json({ error: "请输入账号和密码" }, { status: 400 });
    const config = await getJofshopConfig();
    if (!config.enabled) return Response.json({ error: "JOFSHOP 登录尚未启用" }, { status: 403 });
    const result = await jofshopRequest<ApiResponse<{ token?: string }>>(config, "/account/login", {
      method: "POST",
      body: JSON.stringify({ username: input.username, password: input.password, captcha: input.captcha || "", captcha_key: input.captchaKey || "" }),
    });
    if (result?.code !== 200 || !result.data?.token) throw new Error(result?.message || "账号、密码或验证码不正确");
    const token = result.data.token;
    const initialized = await jofshopRequest<ApiResponse<{ user_info?: Record<string, unknown> }>>(config, "/init", { method: "GET" }, token);
    const info = initialized?.data?.user_info || {};
    const externalId = String(info.id ?? info.account_id ?? info.uid ?? input.username);
    const username = String(info.username ?? input.username);
    const email = String(info.email || `${encodeURIComponent(username)}@jofshop.local`);
    const displayName = String(info.nickname ?? info.name ?? username);
    const mappedRole = displayName === "超级账户" ? "DEVELOPER" : "USER";
    const workspace = await db.workspace.findFirst({ orderBy: { createdAt: "asc" } });
    if (!workspace) throw new Error("工作区尚未初始化");
    const user = await db.user.upsert({
      where: { authSource_externalId: { authSource: "JOFSHOP", externalId } },
      update: { name: displayName, role: mappedRole, externalUsername: username, externalStatus: "ACTIVE", encryptedExternalToken: encryptJofshopToken(token), lastSyncedAt: new Date() },
      create: { email, name: displayName, role: mappedRole, authSource: "JOFSHOP", externalId, externalUsername: username, externalStatus: "ACTIVE", encryptedExternalToken: encryptJofshopToken(token), lastSyncedAt: new Date(), preferences: { create: {} }, memberships: { create: { workspaceId: workspace.id, role: mappedRole === "DEVELOPER" ? "owner" : "member" } } },
    });
    if (!user.workbenchLoginEnabled) {
      return Response.json({ error: "该账号未获准登录多语言工作台，请联系管理员" }, { status: 403 });
    }
    if (mappedRole === "USER") {
      const personalMembership = await db.membership.findFirst({ where: { userId: user.id, role: "personal-owner" } });
      if (!personalMembership) {
        await db.workspace.create({
          data: {
            name: `${displayName}的工作台`,
            subtitle: "PERSONAL WORKSPACE",
            memberships: { create: { userId: user.id, role: "personal-owner" } },
          },
        });
      }
    }
    (await cookies()).set(SESSION_COOKIE, createSessionValue(user.id), sessionCookieOptions);
    return Response.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "登录失败" }, { status: 401 });
  }
}
