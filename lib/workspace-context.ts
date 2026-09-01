import { db } from "@/lib/db";
import { currentSession } from "@/lib/auth-session";

const DEFAULT_EMAIL = "owner@local.multilingual-workbench";

export async function getWorkspaceContext() {
  const session = await currentSession();
  if (!session) {
    const authSetting = await db.workspaceSetting.findFirst({
      where: { key: "jofshopAuth" },
      select: { value: true },
    });
    const auth = (authSetting?.value || {}) as { enabled?: boolean; enforceLogin?: boolean };
    if (auth.enabled && auth.enforceLogin) throw new Error("AUTH_REQUIRED");
  }
  const sessionUser = session
    ? await db.user.findUnique({
        where: { id: session.userId },
        include: { memberships: { include: { workspace: true } }, preferences: true },
      })
    : null;
  const user = sessionUser || await db.user.upsert({
    where: { email: DEFAULT_EMAIL },
    update: {},
    create: {
      email: DEFAULT_EMAIL,
      name: "工作台管理员",
      preferences: { create: {} },
    },
    include: {
      memberships: { include: { workspace: true } },
      preferences: {
        select: {
          id: true,
          userId: true,
          theme: true,
          pageSize: true,
          sidebarCollapsed: true,
          stickyHeader: true,
          tableDensity: true,
          developerMode: true,
          imagePageSize: true,
          showLanguageLabels: true,
          showOnlineProductLink: true,
          customTheme: true,
          updatedAt: true,
        },
      },
    },
  });
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
