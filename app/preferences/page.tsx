"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/page-heading";
import { applyPreferencesTheme } from "@/components/preference-sync";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { preferenceSchema, type PreferenceInput } from "@/lib/schemas/settings";
import { DEFAULT_TRANSLATION_PROMPT } from "@/lib/translation-prompt";

const defaults: PreferenceInput = {
  theme: "system",
  pageSize: 20,
  sidebarCollapsed: false,
  stickyHeader: true,
  tableDensity: "comfortable",
  developerMode: false,
  imagePageSize: 24,
  showLanguageLabels: true,
  showOnlineProductLink: true,
  customTheme: {
    background: "#f6f8fc",
    foreground: "#172033",
    card: "#ffffff",
    primary: "#2563eb",
    sidebar: "#172234",
    border: "#dbe2ec",
    destructive: "#dc2626",
  },
};

export default function PreferencesPage() {
  const client = useQueryClient();
  const [workerConcurrency, setWorkerConcurrency] = useState(5);
  const [workspaceBrand, setWorkspaceBrand] = useState({
    name: "多语言工作台",
    subtitle: "TRANSLATION ADMIN",
    logoUrl: "",
  });
  const [imagePreviewMaxWidth, setImagePreviewMaxWidth] = useState(860);
  const [translationPrompt, setTranslationPrompt] = useState(
    DEFAULT_TRANSLATION_PROMPT,
  );
  const [logoUploading, setLogoUploading] = useState(false);
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "设置读取失败");
      return data as {
        preferences?: PreferenceInput;
        workerConcurrency?: number;
        imagePreviewMaxWidth?: number;
        translationPrompt?: string;
        workspace?: {
          name?: string;
          subtitle?: string | null;
          logoUrl?: string | null;
        };
      };
    },
    retry: false,
  });
  const form = useForm<PreferenceInput>({
    resolver: zodResolver(preferenceSchema),
    defaultValues: defaults,
  });
  useEffect(() => {
    if (query.data?.preferences)
      form.reset({
        ...defaults,
        ...query.data.preferences,
        customTheme: query.data.preferences.customTheme || defaults.customTheme,
      });
    setWorkerConcurrency(query.data?.workerConcurrency || 5);
    setImagePreviewMaxWidth(query.data?.imagePreviewMaxWidth || 860);
    setTranslationPrompt(
      query.data?.translationPrompt || DEFAULT_TRANSLATION_PROMPT,
    );
    if (query.data?.workspace)
      setWorkspaceBrand({
        name: query.data.workspace.name || "多语言工作台",
        subtitle: query.data.workspace.subtitle || "",
        logoUrl: query.data.workspace.logoUrl || "",
      });
  }, [query.data, form]);
  const selectedTheme = form.watch("theme");
  const customTheme = form.watch("customTheme");
  useEffect(() => {
    if (selectedTheme === "custom" && customTheme)
      applyPreferencesTheme({ theme: "custom", customTheme });
  }, [selectedTheme, customTheme]);
  const mutation = useMutation({
    mutationFn: async (data: PreferenceInput) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: "preferences", data }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      const workerResponse = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "worker",
          data: { workerConcurrency },
        }),
      });
      const workerResult = await workerResponse.json();
      if (!workerResponse.ok)
        throw new Error(workerResult.error || "Worker 并发保存失败");
      const workspaceResponse = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "workspace",
          data: workspaceBrand,
        }),
      });
      const workspaceResult = await workspaceResponse.json();
      if (!workspaceResponse.ok)
        throw new Error(workspaceResult.error || "后台品牌保存失败");
      const previewResponse = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "imagePreview",
          data: { imagePreviewMaxWidth },
        }),
      });
      const previewResult = await previewResponse.json();
      if (!previewResponse.ok)
        throw new Error(previewResult.error || "图片预览设置保存失败");
      const promptResponse = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "translationPrompt",
          data: { prompt: translationPrompt },
        }),
      });
      const promptResult = await promptResponse.json();
      if (!promptResponse.ok)
        throw new Error(promptResult.error || "翻译提示词保存失败");
      return result;
    },
    onSuccess: async (_result, data) => {
      applyPreferencesTheme(data);
      await client.invalidateQueries({ queryKey: ["settings"] });
    },
  });
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const body = new FormData();
      body.append("logo", file);
      const response = await fetch("/api/settings/logo", { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Logo 上传失败");
      setWorkspaceBrand((current) => ({ ...current, logoUrl: result.logoUrl }));
      await client.invalidateQueries({ queryKey: ["settings"] });
    } finally {
      setLogoUploading(false);
    }
  };
  return (
    <main className="space-y-6 p-6 lg:p-8">
      <PageHeading
        eyebrow="系统设置"
        title="通用设置"
        description="分页、主题、导航冻结和表格密度将保存到用户账户。"
      />
      {query.error && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {query.error.message}。请先配置 DATABASE_URL 并执行数据库迁移。
        </div>
      )}
      <Card className="max-w-4xl border-0 bg-transparent shadow-none">
        <CardContent className="p-0">
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((data) => mutation.mutate(data))}
          >
            <SettingsSection title="外观主题" description="设置页面的明暗模式和自定义品牌配色。">
            <Field label="界面主题">
              <select {...form.register("theme")} className="control">
                <option value="light">白天</option>
                <option value="dark">黑夜</option>
                <option value="system">跟随系统</option>
                <option value="custom">自定义主题</option>
              </select>
            </Field>
            {form.watch("theme") === "custom" && (
              <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
                {(
                  [
                    ["background", "页面背景"],
                    ["foreground", "主要文字"],
                    ["card", "卡片背景"],
                    ["primary", "品牌主色"],
                    ["sidebar", "侧栏背景"],
                    ["border", "边框颜色"],
                    ["destructive", "错误颜色"],
                  ] as const
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{label}</span>
                    <span className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customTheme?.[key] || defaults.customTheme[key]}
                        onChange={(event) =>
                          form.setValue(
                            `customTheme.${key}`,
                            event.target.value,
                            {
                              shouldDirty: true,
                              shouldValidate: true,
                            },
                          )
                        }
                        className="size-9 rounded border bg-transparent"
                      />
                      <Input
                        value={customTheme?.[key] || ""}
                        onChange={(event) =>
                          form.setValue(
                            `customTheme.${key}`,
                            event.target.value,
                            {
                              shouldDirty: true,
                              shouldValidate: true,
                            },
                          )
                        }
                        className="w-28 font-mono text-xs"
                      />
                    </span>
                  </label>
                ))}
              </div>
            )}
            </SettingsSection>
            <SettingsSection title="分页设置" description="分别控制常规列表和图片工作台每页显示的数量。">
            <Field label="通用分页数量">
              <Input
                type="number"
                min={5}
                max={200}
                {...form.register("pageSize", { valueAsNumber: true })}
              />
            </Field>
            <Field label="图片工作台每页数量">
              <Input
                type="number"
                min={12}
                max={60}
                {...form.register("imagePageSize", { valueAsNumber: true })}
              />
            </Field>
            </SettingsSection>
            <SettingsSection title="翻译提示词" description="统一约束商品翻译和其他内容翻译的输出方式。">
            <Field label="内置翻译提示词">
              <textarea
                className="min-h-56 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
                value={translationPrompt}
                maxLength={8000}
                onChange={(event) => setTranslationPrompt(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                商品翻译和其他内容翻译都会先遵循此提示词，再结合任务的源语言、目标语言和术语规则执行。
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setTranslationPrompt(DEFAULT_TRANSLATION_PROMPT)}
              >
                恢复内置提示词
              </Button>
            </Field>
            </SettingsSection>
            <SettingsSection title="图片预览" description="设置点击图片后预览窗口的最大显示宽度。">
            <Field label="图片点击预览最大宽度">
              <Input
                type="number"
                min={360}
                max={1600}
                step={20}
                value={imagePreviewMaxWidth}
                onChange={(event) =>
                  setImagePreviewMaxWidth(Number(event.target.value) || 860)
                }
              />
            </Field>
            </SettingsSection>
            <SettingsSection title="后台品牌" description="设置左侧菜单顶部显示的名称、副标题和 Logo。">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="后台名称">
                <Input
                  value={workspaceBrand.name}
                  onChange={(event) =>
                    setWorkspaceBrand((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="后台副标题">
                <Input
                  value={workspaceBrand.subtitle}
                  onChange={(event) =>
                    setWorkspaceBrand((current) => ({
                      ...current,
                      subtitle: event.target.value,
                    }))
                  }
                />
              </Field>
              <div className="space-y-2 sm:col-span-2">
                <Label>后台 Logo</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="grid size-16 place-items-center overflow-hidden rounded-xl border bg-muted">
                    {workspaceBrand.logoUrl ? (
                      <img src={workspaceBrand.logoUrl} alt="Logo 预览" className="size-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">无 Logo</span>
                    )}
                  </div>
                  <label className="inline-flex h-10 cursor-pointer items-center rounded-md border bg-background px-4 text-sm font-medium hover:bg-accent">
                    {logoUploading ? "上传中…" : workspaceBrand.logoUrl ? "更换 Logo" : "上传 Logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/svg+xml"
                      className="sr-only"
                      disabled={logoUploading}
                      onChange={(event) => void uploadLogo(event.target.files?.[0])}
                    />
                  </label>
                  {workspaceBrand.logoUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setWorkspaceBrand((current) => ({ ...current, logoUrl: "" }))}
                    >
                      移除 Logo
                    </Button>
                  )}
                  <span className="text-xs text-muted-foreground">支持 PNG、JPG、WebP、GIF、AVIF、SVG，最大 5MB。</span>
                </div>
              </div>
            </div>
            </SettingsSection>
            <SettingsSection title="任务执行" description="控制后台同时执行任务的最大数量。">
            <Field label="任务并发上限">
              <Input
                type="number"
                min={1}
                max={20}
                value={workerConcurrency}
                onChange={(event) =>
                  setWorkerConcurrency(Number(event.target.value) || 5)
                }
              />
              <span className="block text-xs text-muted-foreground">
                推荐默认 5。数值越高，同一时间运行的任务越多，对模型接口、图片生成和独立站 API 压力也越高。
              </span>
            </Field>
            </SettingsSection>
            <SettingsSection title="界面行为" description="设置表格密度、导航冻结和页面辅助信息。">
            <Field label="表格密度">
              <select {...form.register("tableDensity")} className="control">
                <option value="compact">紧凑</option>
                <option value="comfortable">舒适</option>
                <option value="spacious">宽松</option>
              </select>
            </Field>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" {...form.register("stickyHeader")} />
              冻结顶部导航
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" {...form.register("showLanguageLabels")} />
              语言代码旁显示中文备注
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                {...form.register("showOnlineProductLink")}
              />
              商品卡片显示在线商品链接
            </label>
            <label className="rounded-lg border p-4 text-sm">
              <span className="flex items-center gap-3 font-medium">
                <input type="checkbox" {...form.register("developerMode")} />
                开发者模式
              </span>
              <span className="mt-2 block text-xs text-muted-foreground">
                显示数据库、Worker、API、任务 ID、原始错误和页面技术说明。
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" {...form.register("sidebarCollapsed")} />
              默认收起左侧菜单
            </label>
            </SettingsSection>
            <div className="sticky bottom-4 flex items-center gap-4 rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur">
            <Button disabled={mutation.isPending}>
              {mutation.isPending ? "保存中…" : "保存通用设置"}
            </Button>
            {mutation.error && (
              <p className="text-sm text-red-600">{mutation.error.message}</p>
            )}
            {mutation.isSuccess && (
              <p className="text-sm text-emerald-600">设置已保存</p>
            )}
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-4 border-t pt-4">{children}</div>
    </section>
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
    <Label className="block space-y-2">
      <span>{label}</span>
      {children}
    </Label>
  );
}
