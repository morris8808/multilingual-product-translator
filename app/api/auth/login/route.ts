import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSessionValue, SESSION_COOKIE, SETUP_COOKIE, sessionCookieOptions } from "@/lib/auth-session";
import { hashPassword, verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const input = await request.json() as { username?: string; password?: string };
    const username = String(input.username || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!username || !password) return Response.json({ error: "请输入用户名和密码" }, { status: 400 });
    let user = await db.user.findUnique({ where: { username } });
    if (!user && username === "admin" && password === "admin") {
      const localUsers = await db.user.count({ where: { username: { not: null }, passwordHash: { not: null } } });
      if (localUsers === 0) {
        const workspace = await db.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
        if (!workspace) return Response.json({ error: "工作区尚未初始化" }, { status: 503 });
        user = await db.user.create({
          data: {
            username: "admin",
            passwordHash: await hashPassword("admin"),
            mustChangeCredentials: true,
            email: "admin@local.workbench",
            name: "系统管理员",
            role: "ADMIN",
            authSource: "LOCAL",
            preferences: { create: {} },
            memberships: { create: { workspaceId: workspace.id, role: "owner" } },
          },
        });
      }
    }
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash)))
      return Response.json({ error: "用户名或密码不正确" }, { status: 401 });
    if (!user.workbenchLoginEnabled)
      return Response.json({ error: "该账号已被管理员停用" }, { status: 403 });
    (await cookies()).set(SESSION_COOKIE, createSessionValue(user.id), sessionCookieOptions);
    if (user.mustChangeCredentials) (await cookies()).set(SETUP_COOKIE, "1", sessionCookieOptions);
    return Response.json({ user: { id: user.id, username: user.username, name: user.name }, requiresSetup: user.mustChangeCredentials });
  } catch {
    return Response.json({ error: "登录失败，请稍后重试" }, { status: 500 });
  }
}
