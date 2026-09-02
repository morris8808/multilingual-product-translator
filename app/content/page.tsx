"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  CloudDownload,
  Download,
  Languages,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ContentEntity } from "@/lib/schemas/content";
import { LANGUAGE_LABELS, languageLabel } from "@/lib/languages";

const CONFIG: Record<ContentEntity, { label: string; fields: string[] }> = {
  collections: {
    label: "商品专辑",
    fields: [
      "title",
      "sub_title",
      "body_html",
      "meta_title",
      "meta_keywords",
      "meta_description",
    ],
  },
  articles: {
    label: "博客文章",
    fields: [
      "title",
      "summary_html",
      "body_html",
      "meta_title",
      "meta_keywords",
      "meta_description",
    ],
  },
  "blog-collections": {
    label: "博客专辑",
    fields: [
      "title",
      "body_html",
      "meta_title",
      "meta_keywords",
      "meta_description",
    ],
  },
  pages: {
    label: "自定义页面",
    fields: [
      "title",
      "body_html",
      "meta_title",
      "meta_keywords",
      "meta_description",
    ],
  },
  site: {
    label: "网站内容",
    fields: ["title", "meta_title", "meta_keywords", "meta_description"],
  },
};
const COMMON_LANGUAGES = Object.keys(LANGUAGE_LABELS);
type RecordItem = {
  id: string;
  sourceId: string;
  title: string | null;
  data: Record<string, unknown>;
};
type Run = {
  id: string;
  targetLanguages: unknown;
  items: Array<{
    id: string;
    field: string;
    sourceText: string;
    translations: Record<string, string> | null;
  }>;
  job: {
    id: string;
    status: string;
    completedItems: number;
    totalItems: number;
  };
};
type Model = {
  id: string;
  name: string;
  model: string;
  kind: string;
  enabled: boolean;
};
type Site = {
  id: string;
  name: string;
  enabledLanguages?: unknown;
  baseLanguage?: string | null;
};

export default function ContentPage() {
  const client = useQueryClient();
  const [entity, setEntity] = useState<ContentEntity>("collections");
  const [siteId, setSiteId] = useState("");
  const [modelId, setModelId] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [fields, setFields] = useState(CONFIG.collections.fields);
  const [selected, setSelected] = useState<string[]>([]);
  const config = CONFIG[entity];
  const sites = useQuery({
    queryKey: ["site-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "站点读取失败");
      return data as Site[];
    },
  });
  const siteRows = useMemo(
    () => (Array.isArray(sites.data) ? sites.data : []),
    [sites.data],
  );
  const models = useQuery({
    queryKey: ["model-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/models");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型读取失败");
      return data as Model[];
    },
  });
  const modelRows = useMemo(
    () => (Array.isArray(models.data) ? models.data : []),
    [models.data],
  );
  const records = useQuery({
    queryKey: ["content-records", entity],
    queryFn: async () => {
      const r = await fetch(`/api/content?entity=${entity}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data as RecordItem[];
    },
  });
  const recordRows = useMemo(
    () => (Array.isArray(records.data) ? records.data : []),
    [records.data],
  );
  const runs = useQuery({
    queryKey: ["content-jobs", entity],
    queryFn: async () => {
      const r = await fetch(`/api/content/jobs?entity=${entity}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      return data as Run[];
    },
    refetchInterval: 3000,
  });
  const runRows = useMemo(
    () => (Array.isArray(runs.data) ? runs.data : []),
    [runs.data],
  );
  useEffect(() => {
    if (!siteId && siteRows[0]) setSiteId(siteRows[0].id);
  }, [siteId, siteRows]);
  useEffect(() => {
    if (!modelId) {
      const model = modelRows.find(
        (item) => item.kind === "TEXT" && item.enabled,
      );
      if (model) setModelId(model.id);
    }
  }, [modelId, modelRows]);
  useEffect(() => {
    setFields(config.fields);
  }, [config]);
  useEffect(() => {
    setSelected(recordRows.map((item) => item.id));
  }, [recordRows]);
  const sync = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity, siteId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "同步失败");
      return data as { imported: number };
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["content-records", entity] }),
  });
  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/content/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity,
          recordIds: selected,
          modelConnectionId: modelId,
          sourceLanguage: "auto",
          targetLanguages: languages,
          fields,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "任务创建失败");
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["content-jobs", entity] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const latest = runRows[0];
  const currentSite = siteRows.find((site) => site.id === siteId);
  const percent = latest?.job.totalItems
    ? Math.round((latest.job.completedItems / latest.job.totalItems) * 100)
    : 0;
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="内容工作台"
        title="其他内容翻译"
        description="从独立站拉取内容到 PostgreSQL，选择字段和语言后交给后台 Worker；关闭页面不会中断。"
      />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CONFIG) as ContentEntity[]).map((key) => (
          <Button
            key={key}
            variant={entity === key ? "default" : "outline"}
            onClick={() => setEntity(key)}
          >
            {CONFIG[key].label}
          </Button>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{config.label}任务</CardTitle>
            <CardDescription>
              真实站点数据、数据库快照与后台任务。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="space-y-2 text-sm font-medium">
              <span>独立站连接</span>
              <select
                className="control"
                value={siteId}
                onChange={(e) => setSiteId(e.target.value)}
              >
                <option value="">选择站点</option>
                {siteRows.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant="outline"
              className="w-full"
              disabled={!siteId || sync.isPending}
              onClick={() => sync.mutate()}
            >
              {sync.isPending ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <CloudDownload className="size-4" />
              )}
              同步{config.label}
            </Button>
            {sync.data && (
              <p className="text-sm text-emerald-600">
                已同步 {sync.data.imported} 条
              </p>
            )}
            {sync.error && (
              <p className="text-sm text-destructive">{sync.error.message}</p>
            )}
            <div className="space-y-4 border-t pt-4">
              <label className="space-y-2 text-sm font-medium">
                <span>文本模型</span>
                <select
                  className="control"
                  value={modelId}
                  onChange={(e) => setModelId(e.target.value)}
                >
                  <option value="">选择模型</option>
                  {modelRows
                    .filter((item) => item.kind === "TEXT" && item.enabled)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.model}
                      </option>
                    ))}
                </select>
              </label>
              <div className="space-y-2 text-sm font-medium">
                <span>目标语言</span>
                <ContentLanguagePicker
                  value={languages}
                  baseLanguage={currentSite?.baseLanguage || ""}
                  siteLanguages={currentSite?.enabledLanguages}
                  onChange={setLanguages}
                />
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">翻译字段</p>
                <div className="flex flex-wrap gap-2 rounded-lg border p-3">
                  {config.fields.map((field) => (
                    <Button
                      key={field}
                      size="sm"
                      variant={fields.includes(field) ? "default" : "outline"}
                      onClick={() =>
                        setFields(
                          fields.includes(field)
                            ? fields.filter((item) => item !== field)
                            : [...fields, field],
                        )
                      }
                    >
                      {field}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                已选 {selected.length}/{recordRows.length} 条 ·{" "}
                {fields.length} 个字段
              </div>
              <Button
                className="w-full"
                disabled={!selected.length || !modelId || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                提交后台翻译
              </Button>
              {create.error && (
                <p className="text-sm text-destructive">
                  {create.error.message}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>{config.label}源内容</CardTitle>
                  <CardDescription className="mt-2">
                    保存在 PostgreSQL，可重新同步更新。
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {selected.length}/{recordRows.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-[420px] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-12 p-3">
                        <input
                          type="checkbox"
                          checked={
                            Boolean(recordRows.length) &&
                            selected.length === recordRows.length
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? recordRows.map((item) => item.id)
                                : [],
                            )
                          }
                        />
                      </th>
                      <th className="p-3 text-left">ID</th>
                      <th className="p-3 text-left">标题</th>
                      {config.fields.slice(1, 4).map((field) => (
                        <th key={field} className="p-3 text-left">
                          {field}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {recordRows.map((item) => (
                      <tr key={item.id}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            onChange={(e) =>
                              setSelected(
                                e.target.checked
                                  ? [...selected, item.id]
                                  : selected.filter((id) => id !== item.id),
                              )
                            }
                          />
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {item.sourceId}
                        </td>
                        <td className="max-w-64 truncate p-3 font-medium">
                          {item.title || String(item.data.title || "未命名")}
                        </td>
                        {config.fields.slice(1, 4).map((field) => (
                          <td key={field} className="max-w-64 truncate p-3">
                            {String(item.data[field] || "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!recordRows.length && (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    尚未同步{config.label}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Languages className="size-5 text-primary" />
                    最近任务
                  </CardTitle>
                  <CardDescription className="mt-2">
                    进度与译文从数据库恢复。
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void runs.refetch()}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {latest ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span>
                      {percent}% · {latest.job.completedItems}/
                      {latest.job.totalItems}
                    </span>
                    <Badge
                      variant={
                        latest.job.status === "REVIEW" ||
                        latest.job.status === "COMPLETED"
                          ? "success"
                          : "outline"
                      }
                    >
                      {latest.job.status}
                    </Badge>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {latest.items.some((item) => item.translations) && (
                    <ContentReview
                      run={latest}
                      onChanged={() => void runs.refetch()}
                    />
                  )}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无任务
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function ContentReview({
  run,
  onChanged,
}: {
  run: Run;
  onChanged: () => void;
}) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        run.items.map((item) => [item.id, item.translations || {}]),
      ),
  );
  const [preview, setPreview] = useState<{
    site: { name: string };
    entity: string;
    items: Array<{ sourceId: string; title: string | null; written: boolean }>;
  }>();
  const [message, setMessage] = useState("");
  async function save(item: Run["items"][number]) {
    const response = await fetch(`/api/translation-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translations: values[item.id] || {},
        status: "REVIEWED",
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "译文已保存" : data.error || "保存失败");
    if (response.ok) onChanged();
  }
  async function complete() {
    const response = await fetch(`/api/translation-jobs/${run.id}/complete`, {
      method: "POST",
    });
    const data = await response.json();
    setMessage(response.ok ? "审核已确认完成" : data.error || "确认失败");
    if (response.ok) onChanged();
  }
  async function loadPreview() {
    const response = await fetch(`/api/content/jobs/${run.id}/writeback`);
    const data = await response.json();
    if (response.ok) {
      setPreview(data);
      setMessage("");
    } else setMessage(data.error || "预览失败");
  }
  async function writeback() {
    const response = await fetch(`/api/content/jobs/${run.id}/writeback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? "已提交后台写回任务，关闭页面不会中断；可在顶部任务中心查看进度"
        : data.error || "写回失败",
    );
    if (response.ok) {
      setPreview(undefined);
      onChanged();
    }
  }
  return (
    <div className="space-y-3">
      <div className="max-h-80 space-y-2 overflow-auto rounded-lg bg-muted/40 p-3">
        {run.items.slice(0, 50).map((item) => (
          <div key={item.id} className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{item.field}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.sourceText}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => void save(item)}>
                <Save className="size-3.5" />
                保存
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(values[item.id] || {}).map(
                ([language, value]) => (
                  <label key={language} className="text-xs">
                    <span className="mb-1 block font-medium">{language}</span>
                    <Input
                      value={value}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          [item.id]: {
                            ...(current[item.id] || {}),
                            [language]: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <a href={`/api/translation-jobs/${run.id}/export`}>
            <Download className="size-3.5" />
            导出 XLSX
          </a>
        </Button>
        {run.job.status === "REVIEW" && (
          <Button size="sm" onClick={() => void complete()}>
            <CheckCircle2 className="size-3.5" />
            确认审核完成
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={() => void loadPreview()}>
          <Send className="size-3.5" />
          同步到独立站（先预览）
        </Button>
      </div>
      {preview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">
            即将写回 {preview.site.name}：{preview.items.length} 条{" "}
            {preview.entity}
          </p>
          <p className="mt-1 text-xs">相同译文已成功写回时会按幂等键跳过。</p>
          <Button
            size="sm"
            variant="destructive"
            className="mt-3"
            onClick={() => void writeback()}
          >
            确认写回独立站
          </Button>
        </div>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

function ContentLanguagePicker({
  value,
  baseLanguage,
  siteLanguages,
  onChange,
}: {
  value: string[];
  baseLanguage: string;
  siteLanguages: unknown;
  onChange: (value: string[]) => void;
}) {
  const site = Array.isArray(siteLanguages)
    ? siteLanguages.map(String).filter((code) => code && code !== baseLanguage)
    : [];
  const options = Array.from(
    new Set([
      ...site,
      ...COMMON_LANGUAGES.filter((code) => code !== baseLanguage),
    ]),
  );
  const allSiteSelected = site.length > 0 && site.every((code) => value.includes(code));
  const toggle = (code: string) =>
    onChange(
      value.includes(code)
        ? value.filter((item) => item !== code)
        : [...value, code],
    );
  return (
    <div className="space-y-2">
      <div className="flex max-h-32 flex-wrap gap-2 overflow-auto rounded-lg border p-3">
        {options.map((code) => (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={value.includes(code) ? "default" : "outline"}
            onClick={() => toggle(code)}
          >
            {code} · {languageLabel(code)}
            {site.includes(code) && (
              <span className="ml-1 text-[10px] opacity-70">站点</span>
            )}
          </Button>
        ))}
      </div>
      {site.length > 0 && (
        <button
          type="button"
          className="text-xs text-primary"
          onClick={() => onChange(allSiteSelected ? [] : site)}
        >
          {allSiteSelected ? "取消全部站点语言" : "选择全部站点语言"}
        </button>
      )}
    </div>
  );
}
