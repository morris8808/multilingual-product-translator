import { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { currentSession, SETUP_COOKIE } from "@/lib/auth-session";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await currentSession();
    if (!session) return Response.json({ error: "登录已失效，请重新登录" }, { status: 401 });
    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user?.mustChangeCredentials) return Response.json({ error: "当前账号不需要初始化" }, { status: 409 });
    const input = await request.json() as { username?: string; password?: string; confirmPassword?: string };
    const username = String(input.username || "").trim().toLowerCase();
    const password = String(input.password || "");
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username))
      return Response.json({ error: "用户名需为 3–32 位字母、数字、点、下划线或短横线" }, { status: 400 });
    if (password.length < 8 || password.length > 128)
      return Response.json({ error: "新密码需为 8–128 个字符" }, { status: 400 });
    if (password !== input.confirmPassword)
      return Response.json({ error: "两次输入的密码不一致" }, { status: 400 });
    if (username === "admin" && password === "admin")
      return Response.json({ error: "不能继续使用初始用户名和密码" }, { status: 400 });
    await db.user.update({
      where: { id: user.id },
      data: { username, passwordHash: await hashPassword(password), name: username, role: "ADMIN", mustChangeCredentials: false },
    });
    (await cookies()).delete(SETUP_COOKIE);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return Response.json({ error: "该用户名已被使用" }, { status: 409 });
    return Response.json({ error: error instanceof Error ? error.message : "账号初始化失败" }, { status: 500 });
  }
}
