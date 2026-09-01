import { db } from "@/lib/db";
import { getJofshopConfig } from "@/lib/jofshop-config";
import { decryptJofshopToken, jofshopRequest, jofshopSkillRequest } from "@/lib/jofshop";

export const runtime = "nodejs";

type ApiResponse = { code?: number; message?: string; data?: unknown };
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const current = attempts.get(ip);
    if (current && current.resetAt > now && current.count >= 5) return Response.json({ error: "注册请求过于频繁，请稍后再试" }, { status: 429 });
    attempts.set(ip, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + 10 * 60_000 });

    const input = await request.json() as { username?: string; nickname?: string; password?: string; confirmPassword?: string };
    const username = String(input.username || "").trim();
    const nickname = String(input.nickname || "").trim();
    const password = String(input.password || "");
    if (!username || !nickname) return Response.json({ error: "请输入登录账号和昵称" }, { status: 400 });
    if (password.length < 8) return Response.json({ error: "密码至少需要 8 个字符" }, { status: 400 });
    if (password !== input.confirmPassword) return Response.json({ error: "两次输入的密码不一致" }, { status: 400 });

    const workspace = await db.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!workspace) throw new Error("工作区尚未初始化");
    const config = await getJofshopConfig(workspace.id);
    const payload = { username, nickname, password, status: 1, role_id: 0 };
    let result: ApiResponse;
    try {
      result = await jofshopSkillRequest<ApiResponse>(config, "/api/skill/system-user/create-user", { method: "POST", body: JSON.stringify(payload) });
      if (result.code !== 200) throw new Error(result.message || "Skill 用户接口注册失败");
    } catch (skillError) {
      const account = await db.user.findFirst({
        where: { authSource: "JOFSHOP", encryptedExternalToken: { not: null }, memberships: { some: { workspaceId: workspace.id } } },
        orderBy: [{ role: "desc" }, { lastSyncedAt: "desc" }],
        select: { encryptedExternalToken: true },
      });
      if (!account?.encryptedExternalToken) throw skillError;
      result = await jofshopRequest<ApiResponse>(config, "/mainmanager/account/create", { method: "POST", body: JSON.stringify(payload) }, decryptJofshopToken(account.encryptedExternalToken)) || {};
    }
    if (result.code !== 200) return Response.json({ error: result.message || "JOFSHOP 注册失败" }, { status: 400 });
    return Response.json({ ok: true, message: "注册成功，请使用新账号登录" });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "注册失败" }, { status: 502 });
  }
}
