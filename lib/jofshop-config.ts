import { db } from "@/lib/db";
import { DEFAULT_JOFSHOP_CONFIG, type JofshopConfig } from "@/lib/jofshop";

export async function getJofshopConfig(workspaceId?: string): Promise<JofshopConfig> {
  const workspace = workspaceId
    ? { id: workspaceId }
    : await db.workspace.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!workspace) return DEFAULT_JOFSHOP_CONFIG;
  const setting = await db.workspaceSetting.findUnique({
    where: { workspaceId_key: { workspaceId: workspace.id, key: "jofshopAuth" } },
  });
  return { ...DEFAULT_JOFSHOP_CONFIG, ...((setting?.value || {}) as Partial<JofshopConfig>) };
}
