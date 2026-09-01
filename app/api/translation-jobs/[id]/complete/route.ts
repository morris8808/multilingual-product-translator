import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { workspace } = await getWorkspaceContext();
  const translation = await db.translationJob.findFirst({
    where: { id, job: { workspaceId: workspace.id } },
    include: { items: true },
  });
  if (!translation)
    return Response.json({ error: "翻译任务不存在" }, { status: 404 });
  if (
    translation.items.some((item) => {
      if (!item.translations || item.status === "FAILED") return true;
      const values = item.translations as Record<string, unknown>;
      const languages = Array.isArray(translation.targetLanguages)
        ? translation.targetLanguages.map(String)
        : [];
      return languages.some(
        (language) => !String(values[language] || "").trim(),
      );
    })
  )
    return Response.json(
      { error: "仍有未完成、空白或失败的目标语言译文" },
      { status: 409 },
    );
  await db.$transaction([
    db.job.update({
      where: { id: translation.jobId },
      data: {
        status: "COMPLETED",
        finishedAt: new Date(),
        events: { create: { level: "INFO", message: "翻译审核已确认完成" } },
      },
    }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        action: "TRANSLATION_REVIEW_COMPLETE",
        entityType: "TranslationJob",
        entityId: id,
        detail: { items: translation.items.length },
      },
    }),
  ]);
  return Response.json({ ok: true });
}
