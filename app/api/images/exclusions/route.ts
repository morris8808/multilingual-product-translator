import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";

const SETTING_KEY = "excludedImageAssetIds";

export async function PATCH(request: Request) {
  const { workspace } = await getWorkspaceContext();
  const body = (await request.json()) as {
    imageIds?: unknown;
    action?: unknown;
  };
  const imageIds = Array.isArray(body.imageIds)
    ? body.imageIds.map(String).filter(Boolean)
    : [];
  const action = body.action === "restore" ? "restore" : "exclude";
  if (!imageIds.length)
    return Response.json({ error: "请选择图片" }, { status: 400 });

  const existing = await db.workspaceSetting.findUnique({
    where: {
      workspaceId_key: {
        workspaceId: workspace.id,
        key: SETTING_KEY,
      },
    },
  });
  const current = Array.isArray((existing?.value as { ids?: unknown })?.ids)
    ? ((existing?.value as { ids?: unknown[] }).ids || []).map(String)
    : [];
  const next =
    action === "restore"
      ? current.filter((id) => !imageIds.includes(id))
      : Array.from(new Set([...current, ...imageIds]));

  await db.workspaceSetting.upsert({
    where: {
      workspaceId_key: {
        workspaceId: workspace.id,
        key: SETTING_KEY,
      },
    },
    update: { value: { ids: next } },
    create: {
      workspaceId: workspace.id,
      key: SETTING_KEY,
      value: { ids: next },
    },
  });

  return Response.json({ ids: next });
}
