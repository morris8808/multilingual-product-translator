import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { translationItemReviewSchema } from "@/lib/schemas/review";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const input = translationItemReviewSchema.parse(await request.json());
    const { workspace } = await getWorkspaceContext();
    const item = await db.translationItem.findFirst({
      where: { id, translationJob: { job: { workspaceId: workspace.id } } },
    });
    if (!item) return Response.json({ error: "翻译项不存在" }, { status: 404 });
    const updated = await db.translationItem.update({
      where: { id },
      data: {
        translations: JSON.parse(
          JSON.stringify(input.translations),
        ) as Prisma.InputJsonValue,
        status: input.status,
        error: null,
      },
    });
    return Response.json(updated);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "审核保存失败" },
      { status: 400 },
    );
  }
}
