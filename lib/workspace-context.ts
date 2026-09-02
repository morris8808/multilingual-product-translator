import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth-session";

export async function getWorkspaceContext() {
  const session = await currentSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { memberships: { include: { workspace: true } }, preferences: true },
  });
  if (!user?.username || !user.passwordHash) throw new Error("AUTH_REQUIRED");
  const existing =
    user.memberships.find((membership) => membership.role === "personal-owner")?.workspace ||
    user.memberships[0]?.workspace;
  if (existing) return { user, workspace: existing };
  const workspace = await db.workspace.create({
    data: {
      name: "多语言工作台",
      subtitle: "TRANSLATION ADMIN",
      memberships: { create: { userId: user.id, role: "owner" } },
    },
  });
  return { user, workspace };
}
