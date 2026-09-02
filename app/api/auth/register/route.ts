import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";
const attempts = new Map<string, { count: number; resetAt: number }>();

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const now = Date.now();
    const current = attempts.get(ip);
    if (current && current.resetAt > now && current.count >= 10)
      return Response.json({ error: "注册请求过于频繁，请稍后再试" }, { status: 429 });
    attempts.set(ip, current && current.resetAt > now ? { ...current, count: current.count + 1 } : { count: 1, resetAt: now + 10 * 60_000 });

    const input = await request.json() as { username?: string; password?: string; confirmPassword?: string };
    const username = String(input.username || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
      return Response.json({ error: "用户名需为 3–32 位字母、数字、点、下划线或短横线" }, { status: 400 });
    if (password.length < 8 || password.length > 128)
      return Response.json({ error: "密码需为 8–128 个字符" }, { status: 400 });
    if (password !== input.confirmPassword)
      return Response.json({ error: "两次输入的密码不一致" }, { status: 400 });

    const [localUsers, sharedWorkspace] = await Promise.all([
      db.user.count({ where: { username: { not: null }, passwordHash: { not: null } } }),
      db.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }),
    ]);
    const firstUser = localUsers === 0;
    const passwordHash = await hashPassword(password);
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          passwordHash,
          email: `${username}@local.workbench`,
          name: username,
          role: firstUser ? "DEVELOPER" : "USER",
          authSource: "LOCAL",
          preferences: { create: {} },
        },
      });
      if (firstUser && sharedWorkspace) {
        await tx.membership.create({ data: { userId: user.id, workspaceId: sharedWorkspace.id, role: "owner" } });
      } else {
        await tx.workspace.create({ data: { name: `${username}的工作台`, subtitle: "PERSONAL WORKSPACE", memberships: { create: { userId: user.id, role: "personal-owner" } } } });
      }
    });
    return Response.json({ ok: true, message: firstUser ? "管理员账号创建成功，请登录" : "账号创建成功，请登录" }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "该用户名已被注册" }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : "注册失败" }, { status: 500 });
  }
}
