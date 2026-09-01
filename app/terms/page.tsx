"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { termInputSchema, type TermInput } from "@/lib/schemas/terms";
import { LANGUAGE_LABELS, languageLabel } from "@/lib/languages";
type TermRow = Omit<TermInput, "translations"> & {
  id: string;
  translations: Record<string, string>;
};
type Model = {
  id: string;
  name: string;
  model: string;
  kind: string;
  enabled: boolean;
};
const defaults: TermInput = {
  source: "",
  mode: "FIXED",
  category: "custom",
  enabled: true,
  caseSensitive: false,
  spaceAfter: false,
  note: "",
  translations: { en: "", ja: "" },
};
export default function TermsPage() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [modelId, setModelId] = useState("");
  const [aiPending, setAiPending] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv" | "json">(
    "xlsx",
  );
  const query = useQuery({
    queryKey: ["terms"],
    queryFn: async () => {
      const response = await fetch("/api/terms");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "术语读取失败");
      return data as TermRow[];
    },
  });
  const sites = useQuery({
    queryKey: ["site-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "站点读取失败");
      return data as Array<{ enabledLanguages: unknown }>;
    },
  });
  const siteRows = Array.isArray(sites.data) ? sites.data : [];
  const models = useQuery({
    queryKey: ["model-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/models");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型读取失败");
      return data as Model[];
    },
  });
  const termRows = Array.isArray(query.data) ? query.data : [];
  const modelRows = Array.isArray(models.data) ? models.data : [];
  const textModels =
    modelRows.filter((model) => model.kind === "TEXT" && model.enabled) || [];
  const siteLanguages = Array.from(
    new Set(
      siteRows.flatMap((site) =>
        Array.isArray(site.enabledLanguages)
          ? site.enabledLanguages.map(String)
          : [],
      ),
    ),
  );
  const languageOptions = Array.from(
    new Set([...siteLanguages, ...Object.keys(LANGUAGE_LABELS)]),
  );
  const form = useForm<TermInput>({
    resolver: zodResolver(termInputSchema),
    defaultValues: defaults,
  });
  const save = useMutation({
    mutationFn: async (data: TermInput) => {
      const response = await fetch("/api/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      return result;
    },
    onSuccess: () => {
      form.reset(defaults);
      setEditorOpen(false);
      void client.invalidateQueries({ queryKey: ["terms"] });
    },
  });
  const rows = useMemo(
    () =>
      termRows.filter((item) =>
        item.source.toLowerCase().includes(search.toLowerCase()),
      ),
    [termRows, search],
  );
  const edit = (term: TermRow) => {
    form.reset({
      id: term.id,
      source: term.source,
      mode: term.mode,
      category: term.category,
      enabled: term.enabled,
      caseSensitive: term.caseSensitive,
      spaceAfter: term.spaceAfter,
      note: term.note || "",
      translations: {
        en: term.translations.en || "",
        ja: term.translations.ja || "",
        ...term.translations,
      },
    });
    setTargetLanguage(Object.keys(term.translations)[0] || "en");
    setEditorOpen(true);
  };
  const remove = async (id: string) => {
    await fetch(`/api/terms/${id}`, { method: "DELETE" });
    void client.invalidateQueries({ queryKey: ["terms"] });
    if (form.getValues("id") === id) form.reset(defaults);
  };
  const exportTerms = async () => {
    const rows = termRows.map(({ translations, ...term }) => ({
      ...term,
      ...Object.fromEntries(
        Object.entries(translations).map(([language, value]) => [
          `translation_${language}`,
          value,
        ]),
      ),
    }));
    if (exportFormat === "json") {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(termRows, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "terminology.json";
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    const XLSX = await import("xlsx");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), "术语");
    XLSX.writeFile(book, `terminology.${exportFormat}`, {
      bookType: exportFormat,
    });
  };
  const importTerms = async (file: File) => {
    try {
      let parsed: unknown;
      if (file.name.toLowerCase().endsWith(".json"))
        parsed = JSON.parse(await file.text());
      else {
        const XLSX = await import("xlsx");
        const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
        parsed = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
          defval: "",
        });
      }
      if (!Array.isArray(parsed)) throw new Error("JSON 顶层必须是术语数组");
      let count = 0;
      for (const row of parsed) {
        const source =
          row && typeof row === "object"
            ? (row as Record<string, unknown>)
            : {};
        const response = await fetch("/api/terms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source: String(source.source || ""),
            mode: source.mode === "PRESERVE" ? "PRESERVE" : "FIXED",
            category: String(source.category || "custom"),
            enabled: source.enabled !== false,
            caseSensitive: Boolean(source.caseSensitive),
            spaceAfter: Boolean(source.spaceAfter),
            note: String(source.note || ""),
            translations:
              source.translations && typeof source.translations === "object"
                ? source.translations
                : Object.fromEntries(
                    Object.entries(source)
                      .filter(
                        ([key, value]) =>
                          key.startsWith("translation_") &&
                          String(value).trim(),
                      )
                      .map(([key, value]) => [key.slice(12), String(value)]),
                  ),
          }),
        });
        if (!response.ok) throw new Error(`第 ${count + 1} 条导入失败`);
        count++;
      }
      setImportMessage(`已导入 ${count} 条术语`);
      await client.invalidateQueries({ queryKey: ["terms"] });
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败");
    }
  };
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageHeading
          eyebrow="翻译资产"
          title="术语管理"
          description="统一管理保留原文、固定翻译和多语言术语，翻译 Worker 将从 PostgreSQL 读取规则。"
        />
        <div className="flex gap-2">
          <input
            ref={importRef}
            className="hidden"
            type="file"
            accept=".json,.csv,.xlsx,.xls,application/json,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importTerms(file);
              event.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => importRef.current?.click()}>
            <Upload className="size-4" />
            导入文件
          </Button>
          <select
            className="control w-24"
            value={exportFormat}
            onChange={(event) =>
              setExportFormat(event.target.value as typeof exportFormat)
            }
          >
            <option value="xlsx">Excel</option>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
          <Button variant="outline" onClick={exportTerms}>
            <Download className="size-4" />
            导出
          </Button>
          <Button
            onClick={() => {
              form.reset(defaults);
              setTargetLanguage(siteLanguages[0] || "en");
              setEditorOpen(true);
            }}
          >
            <Plus className="size-4" />
            新增术语
          </Button>
        </div>
      </div>
      {importMessage && (
        <p className="text-sm text-muted-foreground">{importMessage}</p>
      )}
      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <CardTitle>
                术语库{" "}
                <Badge variant="secondary">{termRows.length}</Badge>
              </CardTitle>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索源术语"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted text-muted-foreground">
                  <tr>
                    <th className="p-3">源术语</th>
                    <th className="p-3">规则</th>
                    <th className="hidden p-3 md:table-cell">英文</th>
                    <th className="hidden p-3 lg:table-cell">日文</th>
                    <th className="p-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((term) => (
                    <tr key={term.id} className="hover:bg-muted/40">
                      <td className="p-3 font-medium">
                        {term.source}
                        <div className="mt-1 text-xs text-muted-foreground">
                          {term.category}
                        </div>
                      </td>
                      <td className="p-3">
                        <Badge variant={term.enabled ? "success" : "outline"}>
                          {term.mode === "PRESERVE" ? "保留原文" : "指定译文"}
                        </Badge>
                      </td>
                      <td className="hidden p-3 text-muted-foreground md:table-cell">
                        {term.translations.en || "—"}
                      </td>
                      <td className="hidden p-3 text-muted-foreground lg:table-cell">
                        {term.translations.ja || "—"}
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => edit(term)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-8 text-destructive"
                          onClick={() => remove(term.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="p-10 text-center text-muted-foreground"
                      >
                        {query.isLoading ? "正在加载…" : "暂无术语"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        {editorOpen && (
          <button
            aria-label="关闭术语编辑"
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setEditorOpen(false)}
          />
        )}
        {editorOpen && (
          <Card className="fixed inset-y-6 right-6 z-50 w-[min(560px,calc(100vw-3rem))] overflow-auto shadow-2xl">
            <CardHeader>
              <CardTitle>
                {form.watch("id") ? "编辑术语" : "新增术语"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((data) => save.mutate(data))}
              >
                <Field label="源术语">
                  <Input
                    {...form.register("source")}
                    placeholder="例如：Motavelo"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="规则">
                    <select
                      {...form.register("mode")}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="FIXED">指定目标语言译文</option>
                      <option value="PRESERVE">保留原文</option>
                    </select>
                  </Field>
                  <Field label="分类">
                    <select
                      {...form.register("category")}
                      className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    >
                      <option value="brand">品牌</option>
                      <option value="model">型号</option>
                      <option value="industry">行业</option>
                      <option value="custom">自定义</option>
                    </select>
                  </Field>
                </div>
                <Field label="目标语言">
                  <select
                    className="control"
                    value={targetLanguage}
                    onChange={(event) => setTargetLanguage(event.target.value)}
                  >
                    {languageOptions.map((code) => (
                      <option key={code} value={code}>
                        {code} · {languageLabel(code)} ·{" "}
                        {siteLanguages.includes(code)
                          ? "独立站已启用"
                          : "非独立站语言"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`${languageLabel(targetLanguage)}译文`}>
                  <Input
                    value={String(
                      form.watch(`translations.${targetLanguage}`) || "",
                    )}
                    onChange={(event) =>
                      form.setValue(
                        `translations.${targetLanguage}`,
                        event.target.value,
                      )
                    }
                    disabled={form.watch("mode") === "PRESERVE"}
                  />
                </Field>
                <Field label="文本模型">
                  <select
                    className="control"
                    value={modelId}
                    onChange={(event) => setModelId(event.target.value)}
                  >
                    <option value="">默认启用模型</option>
                    {textModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.model}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    aiPending ||
                    !form.watch("source") ||
                    form.watch("mode") === "PRESERVE"
                  }
                  onClick={async () => {
                    setAiPending(true);
                    try {
                      const response = await fetch("/api/terms/ai", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          source: form.getValues("source"),
                          language: targetLanguage,
                          modelConnectionId: modelId || undefined,
                        }),
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error);
                      form.setValue(
                        `translations.${targetLanguage}`,
                        data.value,
                      );
                    } catch (error) {
                      setImportMessage(
                        error instanceof Error ? error.message : "AI 写入失败",
                      );
                    } finally {
                      setAiPending(false);
                    }
                  }}
                >
                  <Sparkles className="size-4" />
                  {aiPending ? "AI 写入中…" : "AI 写入译文"}
                </Button>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(form.watch("translations") || {})
                    .filter(([, value]) => value)
                    .map(([code]) => (
                      <Button
                        key={code}
                        type="button"
                        size="sm"
                        variant={
                          code === targetLanguage ? "default" : "outline"
                        }
                        onClick={() => setTargetLanguage(code)}
                      >
                        {code} · {languageLabel(code)}
                      </Button>
                    ))}
                </div>
                <Field label="备注">
                  <Input {...form.register("note")} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register("enabled")} />
                  启用术语
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register("caseSensitive")} />
                  区分大小写
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" {...form.register("spaceAfter")} />
                  品牌后自动补空格
                </label>
                {form.formState.errors.source && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.source.message}
                  </p>
                )}
                <Button className="w-full" disabled={save.isPending}>
                  <Save className="size-4" />
                  {save.isPending ? "保存中…" : "保存术语"}
                </Button>
                {save.error && (
                  <p className="text-sm text-destructive">
                    {save.error.message}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
