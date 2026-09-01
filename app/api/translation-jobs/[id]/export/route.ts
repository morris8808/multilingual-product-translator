import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
export async function GET(
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
  const languages = Array.isArray(translation.targetLanguages)
    ? translation.targetLanguages.map(String)
    : [];
  const workbook = XLSX.utils.book_new();
  for (const language of languages) {
    const rows = new Map<string, Record<string, string>>();
    for (const item of translation.items) {
      const key = item.sourceId || item.id;
      const row = rows.get(key) || { product_id: key };
      row[`${item.field}_source`] = item.sourceText;
      const values =
        item.translations &&
        typeof item.translations === "object" &&
        !Array.isArray(item.translations)
          ? (item.translations as Record<string, unknown>)
          : {};
      row[item.field] = String(values[language] || "");
      rows.set(key, row);
    }
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet([...rows.values()]),
      language.slice(0, 31),
    );
  }
  const output = XLSX.write(workbook, {
    type: "buffer",
    bookType: "xlsx",
  }) as Buffer;
  return new Response(new Uint8Array(output), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="translation-${id}.xlsx"`,
    },
  });
}
