"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  PlugZap,
  Plus,
  Save,
} from "lucide-react";
import { useForm } from "react-hook-form";
import React from "react";
import { z } from "zod";
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
import { Label } from "@/components/ui/label";
import {
  IMAGE_PROVIDERS,
  MODEL_PRESETS,
  TEXT_PROVIDERS,
} from "@/lib/model-catalog";
import { modelConnectionSchema } from "@/lib/schemas/settings";
type Input = z.infer<typeof modelConnectionSchema>;
type Row = Omit<Input, "apiKey"> & { id: string; hasApiKey: boolean };
const defaults: Input = {
  kind: "TEXT",
  provider: "ollama",
  name: "本机 Ollama",
  apiBase: "http://localhost:11434",
  apiKey: "",
  model: "hy-mt1.5",
  capabilities: [],
  enabled: true,
};
export default function ModelsPage() {
  const client = useQueryClient();
  const [formOpen, setFormOpen] = React.useState(false);
  const [testingId, setTestingId] = React.useState<string>();
  const query = useQuery({
    queryKey: ["model-connections", "settings-page"],
    queryFn: async () => {
      const [modelsResponse, settingsResponse] = await Promise.all([
        fetch("/api/connections/models"),
        fetch("/api/settings"),
      ]);
      const models = await modelsResponse.json();
      const settings = await settingsResponse.json();
      if (!modelsResponse.ok) throw new Error(models.error || "读取失败");
      if (!settingsResponse.ok) throw new Error(settings.error || "设置读取失败");
      return {
        rows: models as Row[],
        defaultImageModelId: String(settings.defaultImageModelId || ""),
      };
    },
  });
  const modelRows = Array.isArray(query.data?.rows) ? query.data.rows : [];
  const setDefaultImage = useMutation({
    mutationFn: async (modelConnectionId: string) => {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: "defaultImageModel",
          data: { modelConnectionId },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "默认模型保存失败");
      return result;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["model-connections"] }),
  });
  const test = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/connections/models/${id}/test`, {
        method: "POST",
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "连接测试失败");
      return d as { message: string };
    },
    onSettled: () => setTestingId(undefined),
  });
  const form = useForm<Input>({
    resolver: zodResolver(modelConnectionSchema),
    defaultValues: defaults,
  });
  const kind = form.watch("kind");
  const providers = kind === "TEXT" ? TEXT_PROVIDERS : IMAGE_PROVIDERS;
  const provider = form.watch("provider");
  const preset = MODEL_PRESETS[provider];
  const selectProvider = (value: string) => {
    const next = MODEL_PRESETS[value];
    form.setValue("provider", value);
    if (!next) return;
    form.setValue("name", next.name);
    form.setValue("apiBase", next.apiBase);
    form.setValue("model", next.models[0] || "");
    form.setValue("capabilities", next.capabilities);
  };
  const save = useMutation({
    mutationFn: async (data: Input) => {
      const r = await fetch("/api/connections/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "保存失败");
      return result;
    },
    onSuccess: () => {
      form.reset(defaults);
      setFormOpen(false);
      void client.invalidateQueries({ queryKey: ["model-connections"] });
    },
  });
  const edit = (row: Row) => {
    form.reset({
      ...row,
      apiKey: "",
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    });
    setFormOpen(true);
  };
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex items-end justify-between">
        <PageHeading
          eyebrow="系统设置"
          title="模型设置"
          description="统一管理文本、图片、本地、海外、国内和自定义模型；密钥不会回显到浏览器。"
        />
        <Button onClick={() => { form.reset(defaults); setFormOpen(true); }}>
          <Plus className="size-4" />
          新增连接
        </Button>
      </div>
      <div className="grid gap-5">
        <div className="order-2 grid content-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modelRows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer hover:border-primary"
              onClick={() => edit(row)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    {row.kind === "TEXT" ? (
                      <Bot className="size-5" />
                    ) : (
                      <ImageIcon className="size-5" />
                    )}
                  </span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{row.kind}</Badge>
                    {row.enabled && <Badge variant="success">启用</Badge>}
                    {row.kind === "IMAGE" &&
                      query.data?.defaultImageModelId === row.id && (
                        <Badge variant="success">默认</Badge>
                      )}
                  </div>
                </div>
                <CardTitle className="mt-3">{row.name}</CardTitle>
                <CardDescription>
                  {row.provider} · {row.model}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-2 text-xs text-muted-foreground">
                <KeyRound className="size-3.5" />
                {row.hasApiKey ? "已安全配置密钥" : "无需或尚未配置密钥"}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTestingId(row.id);
                    test.mutate(row.id);
                  }}
                  disabled={testingId === row.id}
                >
                  {testingId === row.id ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <PlugZap className="size-3.5" />
                  )}
                  测试连接
                </Button>
                {row.kind === "IMAGE" &&
                  query.data?.defaultImageModelId !== row.id && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDefaultImage.mutate(row.id);
                      }}
                      disabled={!row.enabled || setDefaultImage.isPending}
                    >
                      设为默认
                    </Button>
                  )}
              </CardContent>
            </Card>
          ))}
          {!query.isLoading && modelRows.length === 0 && (
            <Card className="md:col-span-2">
              <CardContent className="p-10 text-center text-muted-foreground">
                暂无模型连接，请点击页面右上角“新增连接”。
              </CardContent>
            </Card>
          )}
          {test.data && (
            <p className="text-sm text-emerald-600 md:col-span-2">
              {test.data.message}
            </p>
          )}
          {test.error && (
            <p className="text-sm text-destructive md:col-span-2">
              {test.error.message}
            </p>
          )}
        </div>
        {formOpen && <button type="button" aria-label="关闭模型编辑弹窗" className="fixed inset-0 z-40 bg-black/45" onClick={() => setFormOpen(false)} />}
        {formOpen && <Card className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(1100px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto shadow-2xl">
          <CardHeader>
            <div className="flex items-start justify-between gap-4"><div><CardTitle>
              {form.watch("id") ? "编辑模型连接" : "新增模型连接"}
            </CardTitle>
            <CardDescription>
              API Key 仅发送至本机服务端并加密保存。
            </CardDescription>
            </div><Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>关闭</Button></div>
          </CardHeader>
          <CardContent>
            <form
              className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={form.handleSubmit((data) => save.mutate(data))}
            >
              <Field label="模型类型">
                <select
                  value={kind}
                  onChange={(event) => {
                    const nextKind = event.target.value as "TEXT" | "IMAGE";
                    form.setValue("kind", nextKind);
                    const first = (
                      nextKind === "TEXT" ? TEXT_PROVIDERS : IMAGE_PROVIDERS
                    )[0][0];
                    selectProvider(first);
                  }}
                  className="control"
                >
                  <option value="TEXT">文本模型</option>
                  <option value="IMAGE">图片模型</option>
                </select>
              </Field>
              <Field label="Provider">
                <select
                  value={provider}
                  onChange={(event) => selectProvider(event.target.value)}
                  className="control"
                >
                  {providers.map(([id, name, type]) => (
                    <option key={id} value={id}>
                      {name} · {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="连接名称">
                <Input {...form.register("name")} />
              </Field>
              <Field label="API Base">
                <Input
                  {...form.register("apiBase")}
                  placeholder="https://api.example.com/v1"
                />
              </Field>
              <Field label="模型名称">
                <Input {...form.register("model")} list="recommended-models" />
                <datalist id="recommended-models">
                  {preset?.models.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                {preset?.models.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {preset.models.map((model) => (
                      <Button
                        key={model}
                        type="button"
                        size="sm"
                        variant={
                          form.watch("model") === model ? "default" : "outline"
                        }
                        onClick={() => form.setValue("model", model)}
                      >
                        {model}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </Field>
              <Field
                label={
                  form.watch("id") ? "更新 API Key（留空保持原值）" : "API Key"
                }
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...form.register("apiKey")}
                />
              </Field>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" {...form.register("enabled")} />
                启用此连接
              </label>
              <Button className="w-full" disabled={save.isPending}>
                <Save className="size-4" />
                {save.isPending ? "保存中…" : "保存模型连接"}
              </Button>
              {save.error && (
                <p className="text-sm text-destructive md:col-span-2 xl:col-span-4">
                  {save.error.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>}
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
