"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  LoaderCircle,
  PlugZap,
  Plus,
  RefreshCw,
  Save,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { PromotionCarousel } from "@/components/promotion-carousel";
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
import { siteConnectionSchema } from "@/lib/schemas/settings";
type Input = z.infer<typeof siteConnectionSchema>;
type Row = Omit<Input, "token"> & { id: string; hasToken: boolean };
const defaults: Input = {
  name: "",
  platform: "jofshop",
  apiUrl: "",
  token: "",
  baseLanguage: "",
  enabledLanguages: [],
};
export default function ConnectionsPage() {
  const client = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [visibleApiUrls, setVisibleApiUrls] = useState<Record<string, boolean>>(
    {},
  );
  const query = useQuery({
    queryKey: ["site-connections"],
    queryFn: async () => {
      let r: Response;
      try { r = await fetch("/api/connections/sites", { cache: "no-store" }); }
      catch { throw new Error("无法连接服务端，请确认项目服务正在运行"); }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "读取失败");
      return data as Row[];
    },
  });
  const rows = Array.isArray(query.data) ? query.data : [];
  const form = useForm<Input>({
    resolver: zodResolver(siteConnectionSchema),
    defaultValues: defaults,
  });
  const save = useMutation({
    mutationFn: async (data: Input) => {
      const r = await fetch("/api/connections/sites", {
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
      void client.invalidateQueries({ queryKey: ["site-connections"] });
    },
  });
  const syncLanguages = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(
        `/api/connections/sites/${id}/sync-languages`,
        { method: "POST" },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "语言同步失败");
      return data;
    },
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["site-connections"] }),
  });
  const testConnection = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/connections/sites/${id}/test`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "连接测试失败");
      return data as { message: string };
    },
  });
  const edit = (row: Row) => {
    form.reset({
      ...row,
      platform: ["fecify", "jofshop"].includes(row.platform.toLowerCase())
        ? "jofshop"
        : row.platform,
      token: "",
      enabledLanguages: Array.isArray(row.enabledLanguages)
        ? row.enabledLanguages
        : [],
    });
    setFormOpen(true);
  };
  const maskedUrl = () => "••••••••••••••";
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex items-end justify-between">
        <PageHeading
          eyebrow="系统设置"
          title="独立站 API"
          description="站点连接、语言能力和凭证由服务端按工作区隔离管理。"
        />
        <Button onClick={() => { form.reset(defaults); setFormOpen(true); }}>
          <Plus className="size-4" />
          新增站点
        </Button>
      </div>
      <div className="grid gap-5">
        <div className="order-2 grid gap-4 xl:grid-cols-2">
          {rows.map((row) => (
            <Card
              key={row.id}
              className="cursor-pointer hover:border-primary"
              onClick={() => edit(row)}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Globe2 className="size-5" />
                  </span>
                  <Badge variant="outline">{["fecify", "jofshop"].includes(row.platform.toLowerCase()) ? "独立站" : row.platform}</Badge>
                </div>
                <CardTitle className="mt-3">{row.name}</CardTitle>
                <CardDescription className="mt-2 flex items-center gap-2">
                  <span className="min-w-0 truncate">
                    {visibleApiUrls[row.id] ? row.apiUrl : maskedUrl()}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    title={visibleApiUrls[row.id] ? "隐藏 API 地址" : "查看 API 地址"}
                    onClick={(event) => {
                      event.stopPropagation();
                      setVisibleApiUrls((current) => ({
                        ...current,
                        [row.id]: !current[row.id],
                      }));
                    }}
                  >
                    {visibleApiUrls[row.id] ? (
                      <EyeOff className="size-3.5" />
                    ) : (
                      <Eye className="size-3.5" />
                    )}
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>源语言：{row.baseLanguage || "未设置"}</span>
                <span className="flex items-center gap-1">
                  <KeyRound className="size-3.5" />
                  {row.hasToken ? "Token 已加密" : "Token 未配置"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto"
                  onClick={(event) => {
                    event.stopPropagation();
                    syncLanguages.mutate(row.id);
                  }}
                  disabled={syncLanguages.isPending}
                >
                  {syncLanguages.isPending ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  同步语言
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={(event) => {
                    event.stopPropagation();
                    testConnection.mutate(row.id);
                  }}
                  disabled={testConnection.isPending}
                >
                  {testConnection.isPending ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <PlugZap className="size-3.5" />
                  )}
                  测试连接
                </Button>
              </CardContent>
            </Card>
          ))}
          {rows.length === 0 && (
            <Card>
              <CardContent className="p-10 text-center text-muted-foreground">
                暂无站点连接，请点击页面右上角“新增站点”。
              </CardContent>
            </Card>
          )}
          {syncLanguages.error && (
            <p className="text-sm text-destructive">
              {syncLanguages.error.message}
            </p>
          )}
          {testConnection.data && (
            <p className="text-sm text-emerald-600">
              {testConnection.data.message}
            </p>
          )}
          {testConnection.error && (
            <p className="text-sm text-destructive">
              {testConnection.error.message}
            </p>
          )}
        </div>
        {formOpen && <button type="button" aria-label="关闭站点编辑弹窗" className="fixed inset-0 z-40 bg-black/45" onClick={() => setFormOpen(false)} />}
        {formOpen && <Card className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(980px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto shadow-2xl">
          <CardHeader>
            <div className="flex items-start justify-between gap-4"><div><CardTitle>{form.watch("id") ? "编辑站点" : "新增站点"}</CardTitle>
            <CardDescription>
              API 响应只返回 hasToken，不返回凭证明文。
            </CardDescription>
            </div><Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>关闭</Button></div>
          </CardHeader>
          <CardContent>
            <form
              className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={form.handleSubmit((data) => save.mutate(data))}
            >
              <Field label="连接名称">
                <Input {...form.register("name")} placeholder="正式站点" />
              </Field>
              <Field label="平台">
                <Input
                  {...form.register("platform")}
                  list="platform-options"
                  placeholder="输入平台名称"
                />
                <datalist id="platform-options">
                  <option value="jofshop">独立站标准接口</option>
                  <option value="custom">自定义平台</option>
                </datalist>
              </Field>
              <Field label="API 地址">
                <Input
                  {...form.register("apiUrl")}
                  placeholder="https://admin.example.com"
                />
              </Field>
              <Field
                label={
                  form.watch("id") ? "更新 Token（留空保持原值）" : "访问 Token"
                }
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  {...form.register("token")}
                />
              </Field>
              <div className="rounded-lg border bg-muted/40 p-3 text-sm md:col-span-2 xl:col-span-4">
                <p className="font-medium">语言由站点自动识别</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  保存连接后点击“同步语言”，系统会读取独立站默认语言和已启用语言，不允许手工覆盖。
                </p>
                {form.watch("id") && (
                  <p className="mt-2 text-xs">
                    源语言：{form.watch("baseLanguage") || "待识别"} ·
                    启用语言：
                    {(form.watch("enabledLanguages") || []).join(", ") ||
                      "待识别"}
                  </p>
                )}
              </div>
              <Button className="w-full" disabled={save.isPending}>
                <Save className="size-4" />
                {save.isPending ? "保存中…" : "保存站点连接"}
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
      <PromotionCarousel />
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
