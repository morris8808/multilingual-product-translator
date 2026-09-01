import { randomBytes } from "node:crypto";
import { getJofshopConfig } from "@/lib/jofshop-config";
import { normalizeApiBaseUrl } from "@/lib/jofshop";
import { currentSession } from "@/lib/auth-session";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = await getJofshopConfig();
    const session = await currentSession();
    const [workspace, sessionUser] = await Promise.all([
      db.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { name: true, subtitle: true, logoUrl: true } }),
      session ? db.user.findUnique({ where: { id: session.userId }, select: { name: true, externalUsername: true } }) : null,
    ]);
    const initResponse = await fetch(`${normalizeApiBaseUrl(config.apiBaseUrl)}/account/login/init`, {
      cache: "no-store", headers: { "client-type": "20" },
    });
    const init = await initResponse.json().catch(() => ({})) as { data?: { login_captcha?: boolean } };
    const captchaKey = randomBytes(9).toString("base64url").slice(0, 11);
    let captchaImage = "";
    if (init.data?.login_captcha !== false) {
      const captcha = await fetch(`${normalizeApiBaseUrl(config.apiBaseUrl)}/captcha?key=${encodeURIComponent(captchaKey)}`, {
        cache: "no-store", headers: { "client-type": "20" },
      });
      if (!captcha.ok) throw new Error("验证码加载失败");
      const contentType = captcha.headers.get("content-type") || "image/png";
      captchaImage = `data:${contentType};base64,${Buffer.from(await captcha.arrayBuffer()).toString("base64")}`;
    }
    return Response.json({ enabled: config.enabled, captchaRequired: init.data?.login_captcha !== false, captchaKey, captchaImage, workspace, authenticated: Boolean(sessionUser), sessionUser });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "登录服务初始化失败" }, { status: 502 });
  }
}
