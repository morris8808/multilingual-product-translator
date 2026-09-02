import { cookies } from "next/headers";
import { SESSION_COOKIE, SETUP_COOKIE } from "@/lib/auth-session";

export async function POST() {
  (await cookies()).delete(SESSION_COOKIE);
  (await cookies()).delete(SETUP_COOKIE);
  return Response.json({ ok: true });
}
