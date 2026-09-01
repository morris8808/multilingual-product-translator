import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listFecifyContent } from "@/lib/integrations/fecify";
import {
  contentEntitySchema,
  contentImportSchema,
} from "@/lib/schemas/content";
import { getWorkspaceContext } from "@/lib/workspace-context";

function sourceId(row: Record<string, unknown>) {
  return String(
    row.id ?? row.collection_id ?? row.article_id ?? row.page_id ?? "",
  );
}

export async function GET(request: Request) {
  try {
    const { workspace } = await getWorkspaceContext();
    const entity = contentEntitySchema.parse(
      new URL(request.url).searchParams.get("entity"),
    );
    const records = await db.contentRecord.findMany({
      where: { workspaceId: workspace.id, entityType: entity },
      orderBy: { updatedAt: "desc" },
      take: 500,
    });
    return Response.json(records);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "内容读取失败" },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const input = contentImportSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const site = await db.siteConnection.findFirst({
      where: { id: input.siteId, workspaceId: workspace.id },
    });
    if (!site)
      return Response.json({ error: "独立站连接不存在" }, { status: 404 });
    const rows: Array<Record<string, unknown>> = [];
    let page = 1;
    let totalPage = 1;
    do {
      const result = await listFecifyContent(site, input.entity, page, 100);
      rows.push(...result.list);
      totalPage = result.totalPage;
      page += 1;
    } while (page <= totalPage);
    let imported = 0;
    for (const row of rows) {
      const id = sourceId(row);
      if (!id) continue;
      await db.contentRecord.upsert({
        where: {
          workspaceId_siteId_entityType_sourceId: {
            workspaceId: workspace.id,
            siteId: site.id,
            entityType: input.entity,
            sourceId: id,
          },
        },
        update: {
          title: String(row.title ?? row.name ?? "") || null,
          data: row as Prisma.InputJsonValue,
        },
        create: {
          workspaceId: workspace.id,
          siteId: site.id,
          entityType: input.entity,
          sourceId: id,
          title: String(row.title ?? row.name ?? "") || null,
          data: row as Prisma.InputJsonValue,
        },
      });
      imported += 1;
    }
    await db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        action: "CONTENT_IMPORT",
        entityType: input.entity,
        detail: { siteId: site.id, imported },
      },
    });
    return Response.json({ imported }, { status: 201 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "内容拉取失败" },
      { status: 400 },
    );
  }
}
