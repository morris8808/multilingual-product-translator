import { db } from "@/lib/db";

export const IMPORT_BATCH_TRASH_KEY = "trashedImportBatches";

export type TrashedImportBatch = { id: string; deletedAt: string };

const parseItems = (value: unknown): TrashedImportBatch[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const items = (value as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as { id?: unknown; deletedAt?: unknown };
    return typeof row.id === "string" && typeof row.deletedAt === "string"
      ? [{ id: row.id, deletedAt: row.deletedAt }]
      : [];
  });
};

export async function getTrashedImportBatches(workspaceId: string) {
  const setting = await db.workspaceSetting.findUnique({
    where: {
      workspaceId_key: { workspaceId, key: IMPORT_BATCH_TRASH_KEY },
    },
    select: { value: true },
  });
  return parseItems(setting?.value);
}

export async function saveTrashedImportBatches(
  workspaceId: string,
  items: TrashedImportBatch[],
) {
  await db.workspaceSetting.upsert({
    where: {
      workspaceId_key: { workspaceId, key: IMPORT_BATCH_TRASH_KEY },
    },
    update: { value: { items } },
    create: {
      workspaceId,
      key: IMPORT_BATCH_TRASH_KEY,
      value: { items },
    },
  });
}
