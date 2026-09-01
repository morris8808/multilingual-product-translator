"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Cloud, Eye, EyeOff, Server } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STORAGE_PROVIDERS } from "@/lib/storage-catalog";
type Connection = {
  id: string;
  provider: string;
  name: string;
  endpoint: string;
  region: string | null;
  bucket: string;
  publicBaseUrl: string | null;
  pathPrefix: string;
  forcePathStyle: boolean;
  enabled: boolean;
  hasAccessKey: boolean;
  hasSecretKey: boolean;
};
const first = STORAGE_PROVIDERS[0];
export default function StoragePage() {
  const client = useQueryClient();
  const [target, setTarget] = useState<"SITE" | "OWN">("SITE");
  const [visibleConnections, setVisibleConnections] = useState<
    Record<string, boolean>
  >({});
  const [form, setForm] = useState({
    id: "",
    provider: String(first.code),
    name: String(first.name),
    endpoint: String(first.endpoint),
    region: String(first.region),
    bucket: "",
    publicBaseUrl: "",
    pathPrefix: "multilingual-workbench",
    accessKey: "",
    secretKey: "",
    forcePathStyle: Boolean(first.forcePathStyle),
    enabled: true,
  });
  const query = useQuery({
    queryKey: ["storage"],
    queryFn: async () => {
      const r = await fetch("/api/storage");
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "读取失败");
      return d as { target: "SITE" | "OWN"; connections: Connection[] };
    },
  });
  useEffect(() => {
    if (query.data) setTarget(query.data.target);
  }, [query.data]);
  const choose = (code: string) => {
    const p = STORAGE_PROVIDERS.find((x) => x.code === code)!;
    setForm((v) => ({
      ...v,
      id: "",
      provider: p.code,
      name: p.name,
      endpoint: p.endpoint,
      region: p.region,
      forcePathStyle: p.forcePathStyle,
    }));
  };
  const edit = (v: Connection) => {
    setTarget("OWN");
    setForm({
      ...v,
      region: v.region || "",
      publicBaseUrl: v.publicBaseUrl || "",
      accessKey: "",
      secretKey: "",
    });
  };
  const maskedEndpoint = () => "••••••••••••••";
  const save = useMutation({
    mutationFn: async () => {
      const body =
        target === "SITE"
          ? {
              ...form,
              target: "SITE",
              bucket: form.bucket || "site",
              endpoint: form.endpoint || "https://example.com",
            }
          : { ...form, target };
      const r = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "保存失败");
      return d;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["storage"] }),
  });
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="基础设施"
        title="图片存储与归档"
        description="选择保留在独立站服务器，或将远端原图和生成结果归档到自有对象存储。密钥加密保存且不会回显。"
      />
      <div className="grid gap-5 lg:grid-cols-2">
        <button
          className={`rounded-xl border p-5 text-left ${target === "SITE" ? "border-primary ring-2 ring-primary/15" : ""}`}
          onClick={() => setTarget("SITE")}
        >
          <Server className="size-6" />
          <p className="mt-3 font-semibold">独立站服务器</p>
          <p className="mt-1 text-sm text-muted-foreground">
            保留远端 URL，不额外复制，管理成本最低。
          </p>
        </button>
        <button
          className={`rounded-xl border p-5 text-left ${target === "OWN" ? "border-primary ring-2 ring-primary/15" : ""}`}
          onClick={() => setTarget("OWN")}
        >
          <Cloud className="size-6" />
          <p className="mt-3 font-semibold">自有对象存储桶</p>
          <p className="mt-1 text-sm text-muted-foreground">
            控制数据生命周期、CDN、域名和跨区域备份。
          </p>
        </button>
      </div>
      {target === "OWN" && (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {STORAGE_PROVIDERS.map((p) => (
              <button
                key={p.code}
                onClick={() => choose(p.code)}
                className={`rounded-xl border p-4 text-left hover:border-primary ${form.provider === p.code ? "border-primary bg-primary/5" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  {"recommended" in p && p.recommended && <Badge variant="success">推荐</Badge>}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.area} · S3 兼容接入
                </p>
              </button>
            ))}
            {query.data?.connections.map((row) => (
              <Card
                key={row.id}
                className="cursor-pointer sm:col-span-2 xl:col-span-3"
                onClick={() => edit(row)}
              >
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">已配置：{row.name}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                          {visibleConnections[row.id]
                            ? `${row.bucket} · ${row.endpoint}`
                            : `${row.bucket} · ${maskedEndpoint()}`}
                      </span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        title={
                          visibleConnections[row.id]
                            ? "隐藏存储地址"
                            : "查看存储地址"
                        }
                        onClick={(event) => {
                          event.stopPropagation();
                          setVisibleConnections((current) => ({
                            ...current,
                            [row.id]: !current[row.id],
                          }));
                        }}
                      >
                        {visibleConnections[row.id] ? (
                          <EyeOff className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                      </Button>
                    </p>
                  </div>
                  <CheckCircle2 className="size-5 text-emerald-500" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>存储桶连接</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                ["连接名称", "name"],
                ["Endpoint", "endpoint"],
                ["Region", "region"],
                ["Bucket", "bucket"],
                ["公开/CDN 基础 URL", "publicBaseUrl"],
                ["路径前缀", "pathPrefix"],
                ["AccessKey", "accessKey"],
                ["SecretKey", "secretKey"],
              ].map(([label, key]) => (
                <div key={key}>
                  <Label>{label}</Label>
                  <Input
                    className="mt-1.5"
                    type={key === "secretKey" ? "password" : "text"}
                    value={String(form[key as keyof typeof form])}
                    placeholder={
                      key === "accessKey" || key === "secretKey"
                        ? form.id
                          ? "留空保持原密钥"
                          : "必填"
                        : ""
                    }
                    onChange={(e) =>
                      setForm((v) => ({ ...v, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.forcePathStyle}
                  onChange={(e) =>
                    setForm((v) => ({ ...v, forcePathStyle: e.target.checked }))
                  }
                />
                Path-style（MinIO 等兼容服务）
              </label>
            </CardContent>
          </Card>
        </div>
      )}
      {save.error && (
        <p className="text-sm text-destructive">{save.error.message}</p>
      )}
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending
            ? "保存中…"
            : target === "SITE"
              ? "使用独立站服务器"
              : "保存并启用存储桶"}
        </Button>
      </div>
    </main>
  );
}
