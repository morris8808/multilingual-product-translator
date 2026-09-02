"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PromotionAd } from "@/lib/promotion-ads";

export function PromotionCarousel() {
  const [active, setActive] = useState(0);
  const query = useQuery({
    queryKey: ["promotion-ads"],
    queryFn: async () => {
      const response = await fetch("/api/promotions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "推广内容读取失败");
      return data.ads as PromotionAd[];
    },
  });
  const ads = query.data || [];
  useEffect(() => {
    if (ads.length < 2) return;
    const timer = window.setInterval(
      () => setActive((value) => (value + 1) % ads.length),
      7000,
    );
    return () => window.clearInterval(timer);
  }, [ads.length]);
  useEffect(() => {
    if (active >= ads.length) setActive(0);
  }, [active, ads.length]);
  if (!ads.length) return null;
  const ad = ads[active];
  const move = (direction: number) =>
    setActive((value) => (value + direction + ads.length) % ads.length);
  return (
    <section className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-sky-500/10 shadow-sm">
      <div className="grid gap-8 p-6 md:p-8 xl:grid-cols-[1.2fr_0.8fr] xl:items-center">
        <div>
          <Badge className="mb-4 gap-1.5" variant="secondary">
            <Rocket className="size-3.5" /> {ad.badge}
          </Badge>
          <h2 className="max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">{ad.title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground md:text-base">{ad.description}</p>
          <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
            {["商品、图片与多语言内容统一管理", "处理结果可直接同步回独立站", "支持 B2C 与 B2B 独立站业务", "快速注册店铺并连接当前工作台"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border bg-background/80 p-5 shadow-sm backdrop-blur">
          <p className="text-sm font-semibold">开通后即可连接本工作台</p>
          <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
            {['打开推广方提供的页面', '按页面说明完成相关操作', '返回工作台继续处理商品'].map((step, index) => (
              <li key={step} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs text-primary-foreground">{index + 1}</span><span>{step}</span></li>
            ))}
          </ol>
          <Button asChild className="mt-5 w-full">
            <a href={ad.url} target="_blank" rel="noreferrer">{ad.buttonLabel}<ArrowRight className="size-4" /></a>
          </Button>
          <p className="mt-3 text-center text-xs text-muted-foreground">将在新窗口打开推广页面</p>
          {ads.length > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2 border-t pt-4">
              <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => move(-1)} aria-label="上一条推广"><ArrowLeft className="size-4" /></Button>
              {ads.map((item, index) => <button key={item.id} type="button" aria-label={`查看第 ${index + 1} 条推广`} onClick={() => setActive(index)} className={`size-2 rounded-full ${index === active ? 'bg-primary' : 'bg-muted-foreground/30'}`} />)}
              <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => move(1)} aria-label="下一条推广"><ArrowRight className="size-4" /></Button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
