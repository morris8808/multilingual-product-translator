"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_PROMOTION_ADS, type PromotionAd } from "@/lib/promotion-ads";

const blankAd = (): PromotionAd => ({
  id: `promotion-${Date.now()}`,
  type: "CUSTOM",
  badge: "推广专区",
  title: "",
  description: "",
  buttonLabel: "了解详情",
  url: "https://",
  enabled: false,
});

export function PromotionManager() {
  const [ads, setAds] = useState<PromotionAd[]>(DEFAULT_PROMOTION_ADS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/promotions?all=1", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "读取失败");
        setAds(result.ads);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "读取失败"))
      .finally(() => setLoading(false));
  }, []);
  const update = (index: number, patch: Partial<PromotionAd>) =>
    setAds((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/promotions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ads }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "保存失败");
      setAds(result.ads);
      setMessage("推广专区已保存，连接页面会自动轮播启用的内容");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle>推广专区管理</CardTitle><CardDescription className="mt-2">配置独立站 API 页面底部广告。启用多条内容后，每 7 秒自动轮播。</CardDescription></div>
        <Button type="button" variant="outline" onClick={() => setAds((current) => [...current, blankAd()])} disabled={ads.length >= 12}><Plus className="size-4" />新增广告</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">正在读取推广配置…</p> : ads.map((ad, index) => (
          <div key={ad.id} className="space-y-4 rounded-xl border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3"><strong>广告 {index + 1}</strong><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={ad.enabled} onChange={(event) => update(index, { enabled: event.target.checked })} />启用轮播</label></div>
              <Button type="button" size="icon" variant="ghost" className="text-destructive" onClick={() => setAds((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`删除广告 ${index + 1}`}><Trash2 className="size-4" /></Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2"><Label>广告类型</Label><select className="control" value={ad.type} onChange={(event) => update(index, { type: event.target.value as PromotionAd['type'] })}><option value="CUSTOM">自定义推广</option><option value="NOTICE">公告通知</option></select></label>
              <label className="space-y-2"><Label>角标文字</Label><Input value={ad.badge} onChange={(event) => update(index, { badge: event.target.value })} /></label>
              <label className="space-y-2 md:col-span-2"><Label>主标题</Label><Input value={ad.title} onChange={(event) => update(index, { title: event.target.value })} /></label>
              <label className="space-y-2 md:col-span-2"><Label>推广说明</Label><textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={ad.description} onChange={(event) => update(index, { description: event.target.value })} /></label>
              <label className="space-y-2"><Label>按钮文字</Label><Input value={ad.buttonLabel} onChange={(event) => update(index, { buttonLabel: event.target.value })} /></label>
              <label className="space-y-2"><Label>跳转链接</Label><Input value={ad.url} onChange={(event) => update(index, { url: event.target.value })} /></label>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3"><Button type="button" onClick={() => void save()} disabled={saving}><Save className="size-4" />{saving ? "保存中…" : "保存推广配置"}</Button>{message && <p className="text-sm text-muted-foreground">{message}</p>}</div>
      </CardContent>
    </Card>
  );
}
