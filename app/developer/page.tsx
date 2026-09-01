"use client";
import { useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PromotionManager } from "@/components/promotion-manager";

export default function DeveloperPage() {
  const [password, setPassword] = useState("");
  const [data, setData] = useState<{
    role: string;
    jobs: Array<{
      id: string;
      type: string;
      status: string;
      result: unknown;
      events: Array<{ id: string; message: string; createdAt: string }>;
    }>;
    audits: Array<{
      id: string;
      action: string;
      entityType: string;
      createdAt: string;
    }>;
  }>();
  const [error, setError] = useState("");
  const unlock = async () => {
    const response = await fetch("/api/developer/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.error || "读取失败");
    else {
      setData(result);
      setError("");
    }
  };
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="系统诊断"
        title="开发者中心"
        description="集中查看后台任务错误、Worker 日志和系统审计记录。仅管理员和开发者可访问。"
      />
      {!data ? (
        <Card className="max-w-lg">
          <CardHeader>
            <CardTitle>开发者身份验证</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="输入开发者查看密码"
            />
            <Button onClick={() => void unlock()}>验证并查看日志</Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            当前身份：
            {data.role === "DEVELOPER"
              ? "系统开发者（最高权限）"
              : "系统管理员"}
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            <PromotionManager />
            <Card>
              <CardHeader>
                <CardTitle>错误任务</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.jobs.map((job) => (
                  <div
                    key={job.id}
                    className="rounded-lg border border-destructive/30 p-3"
                  >
                    <strong>
                      {job.type} · {job.status}
                    </strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {job.events[0]?.message || "任务失败但没有记录详细日志"}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>系统审计</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.audits.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 text-sm">
                    {item.action} · {item.entityType}
                    <span className="block text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </main>
  );
}
