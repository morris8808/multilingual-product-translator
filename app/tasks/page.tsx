"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Square,
  TestTube2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Job = {
  id: string;
  displayName: string | null;
  type: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  etaSeconds: number | null;
  result: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  events: Array<{ id: string; message: string; createdAt: string }>;
};
const statusVariant = (status: string) =>
  status === "COMPLETED"
    ? "success"
    : status === "RUNNING"
      ? "default"
      : "outline";
const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  QUEUED: "等待执行",
  RUNNING: "执行中",
  RETRYING: "自动重试中",
  PAUSED: "已暂停",
  REVIEW: "待审核",
  COMPLETED: "已完成",
  PARTIALLY_COMPLETED: "部分完成",
  FAILED: "执行失败",
  CANCELLED: "已取消",
};
const taskTypeLabel: Record<string, string> = {
  SYSTEM_TEST: "系统测试任务",
  PRODUCT_TRANSLATION: "商品翻译",
  PRODUCT_TRANSLATION_WRITEBACK: "商品翻译写回独立站",
  PRODUCT_FIELD_GENERATE: "商品字段生成",
  PRODUCT_DRAFT_WRITEBACK: "商品数据写回独立站",
  IMAGE_GENERATE: "商品图片生成",
  IMAGE_ARCHIVE: "图片存储归档",
  CONTENT_TRANSLATION: "内容翻译",
  CONTENT_WRITEBACK: "内容翻译写回独立站",
  WORKSPACE_DATA_PURGE: "工作区数据清理",
  LEGACY_TRANSLATION: "旧版翻译迁移",
};
const taskName = (type: string) => taskTypeLabel[type] || type.replaceAll("_", " ");
const formatDuration = (job: Job) => {
  const end = job.finishedAt ? new Date(job.finishedAt).getTime() : Date.now();
  const start = new Date(job.startedAt || job.createdAt).getTime();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  return seconds < 60
    ? `${seconds} 秒`
    : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
};
const explainResult = (result: unknown) => {
  if (!result || typeof result !== "object" || Array.isArray(result))
    return String(result ?? "无结果");
  const value = result as Record<string, unknown>;
  const parts = [];
  if (value.written != null) parts.push(`成功写入 ${value.written} 条`);
  if (value.failed != null)
    parts.push(
      `失败 ${value.failed} 条${Number(value.failed) > 0 ? "，请查看下方日志中的接口错误、凭证或数据格式说明" : ""}`,
    );
  if (value.generated != null) parts.push(`成功生成 ${value.generated} 张图片`);
  if (value.synced != null) parts.push(`成功同步 ${value.synced} 个商品`);
  if (value.remoteDeleted != null)
    parts.push(`删除远程对象 ${value.remoteDeleted} 个`);
  if (value.localDeleted != null)
    parts.push(`删除本地文件 ${value.localDeleted} 个`);
  return parts.length ? parts.join("；") : JSON.stringify(result);
};

export default function TasksPage() {
  const client = useQueryClient();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [status, setStatus] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [date, setDate] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [actionMessage, setActionMessage] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const query = useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const r = await fetch("/api/jobs");
      if (!r.ok) throw new Error("任务读取失败");
      return r.json() as Promise<Job[]>;
    },
    // 活跃任务需要及时刷新；全部结束后降低轮询频率，避免任务页长期占用接口。
    refetchInterval: (current) => {
      const hasActive = (current.state.data as Job[] | undefined)?.some((job) =>
        ["QUEUED", "RUNNING", "RETRYING"].includes(job.status),
      );
      return hasActive ? 3000 : 15000;
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "SYSTEM_TEST", steps: 12, delayMs: 1000 }),
      });
      if (!r.ok) throw new Error("创建失败");
      return r.json();
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
  });
  const action = async (id: string, body: Record<string, string>) => {
    const response = await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "任务操作失败");
    await client.invalidateQueries({ queryKey: ["jobs"] });
    return result;
  };
  const batchAction = async (
    actionName: "resume" | "pause" | "cancel" | "retry" | "delete",
  ) => {
    if (
      ["cancel", "delete"].includes(actionName) &&
      !window.confirm(
        actionName === "delete"
          ? `确定删除选中的 ${selected.length} 条任务记录吗？`
          : `确定结束选中的 ${selected.length} 个任务吗？`,
      )
    )
      return;
    setActionPending(true);
    setActionMessage("");
    const errors: string[] = [];
    let succeeded = 0;
    for (const id of selected) {
      try {
        const response =
          actionName === "delete"
            ? await fetch(`/api/jobs/${id}`, { method: "DELETE" })
            : await fetch(`/api/jobs/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: actionName }),
              });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "操作失败");
        if (actionName === "delete") {
          const current = jobs.find((job) => job.id === id);
          if (current) {
            const existing = JSON.parse(localStorage.getItem("workbench-recycle-bin") || "[]");
            localStorage.setItem("workbench-recycle-bin", JSON.stringify([{ ...current, deletedAt: new Date().toISOString() }, ...existing]));
          }
        }
        succeeded += 1;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "操作失败");
      }
    }
    setActionMessage(
      errors.length
        ? `成功 ${succeeded} 项，失败 ${errors.length} 项：${[...new Set(errors)].join("；")}`
        : `已成功处理 ${succeeded} 项任务`,
    );
    if (!errors.length) setSelected([]);
    await client.invalidateQueries({ queryKey: ["jobs"] });
    setActionPending(false);
  };
  const rename = async (job: Job) => {
    const value = window.prompt(
      "输入任务备注名称",
      job.displayName || taskName(job.type),
    );
    if (value?.trim())
      await action(job.id, { action: "rename", displayName: value.trim() });
  };
  const types = [...new Set((query.data || []).map((job) => job.type))];
  const jobs = useMemo(
    () =>
      (query.data || []).filter(
        (job) =>
          (status === "ALL" || job.status === status) &&
          (type === "ALL" || job.type === type) &&
          (!date || job.createdAt.slice(0, 10) === date),
      ),
    [query.data, status, type, date],
  );
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <PageHeading
          eyebrow="后台任务"
          title="任务中心"
          description="任务状态和日志来自 PostgreSQL，关闭页面、刷新或断网不会停止 Worker。"
        />
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          <TestTube2 className="size-4" />
          {create.isPending ? "创建中…" : "创建系统测试任务"}
        </Button>
      </div>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <select
            className="control w-40"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="ALL">全部状态</option>
            {[
              "QUEUED",
              "RUNNING",
              "PAUSED",
              "REVIEW",
              "COMPLETED",
              "PARTIALLY_COMPLETED",
              "FAILED",
              "CANCELLED",
            ].map((v) => (
              <option key={v} value={v}>
                {statusLabel[v] || v}
              </option>
            ))}
          </select>
          <select
            className="control w-56"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="ALL">全部任务类型</option>
            {types.map((v) => (
              <option key={v} value={v}>{taskName(v)}</option>
            ))}
          </select>
          <Input
            type="date"
            className="w-44"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={
                Boolean(jobs.length) &&
                jobs.every((job) => selected.includes(job.id))
              }
              onChange={(event) =>
                setSelected(
                  event.target.checked ? jobs.map((job) => job.id) : [],
                )
              }
            />
            全选当前结果
          </label>
          <Button
            variant="outline"
            onClick={() => {
              setStatus("ALL");
              setType("ALL");
              setDate("");
            }}
          >
            清除筛选
          </Button>
          <span className="text-sm text-muted-foreground">
            已选 {selected.length} 项
          </span>
          <Button
            size="sm"
            disabled={!selected.length || actionPending}
            onClick={() => void batchAction("resume")}
          >
            <Play className="size-3.5" />
            执行
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || actionPending}
            onClick={() => void batchAction("pause")}
          >
            <Pause className="size-3.5" />
            暂停
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || actionPending}
            onClick={() => void batchAction("cancel")}
          >
            <Square className="size-3.5" />
            结束
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!selected.length || actionPending}
            onClick={() => void batchAction("retry")}
          >
            <RotateCcw className="size-3.5" />
            重新执行
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={!selected.length || actionPending}
            onClick={() => void batchAction("delete")}
          >
            <Trash2 className="size-3.5" />
            删除
          </Button>
        </CardContent>
      </Card>
      {actionMessage && (
        <p className="rounded-lg border bg-card px-3 py-2 text-sm">
          {actionMessage}
        </p>
      )}
      {query.isLoading && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            正在读取任务…
          </CardContent>
        </Card>
      )}
      <div className="space-y-4">
        {jobs.map((job) => {
          const percent = job.totalItems
            ? Math.round((job.completedItems / job.totalItems) * 100)
            : 0;
          return (
            <Card key={job.id}>
              <CardHeader className="cursor-pointer pb-4" onClick={() => setExpanded((current) => current.includes(job.id) ? current.filter((id) => id !== job.id) : [...current, job.id])}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4"
                      checked={selected.includes(job.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...new Set([...current, job.id])]
                            : current.filter((id) => id !== job.id),
                        )
                      }
                    />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{job.displayName || taskName(job.type)}</CardTitle>
                        {job.displayName && (
                          <span className="text-xs text-muted-foreground">
                            {taskName(job.type)}
                          </span>
                        )}
                        <Badge variant={statusVariant(job.status)}>
                          {statusLabel[job.status] || job.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void rename(job)}
                        >
                          <Pencil className="size-3.5" />
                          备注
                        </Button>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {job.completedItems}/{job.totalItems} · {percent}% ·
                        失败 {job.failedItems} ·{" "}
                        <Clock3 className="inline size-3.5" />{" "}
                        {new Date(job.createdAt).toLocaleString()} · 耗时{" "}
                        {formatDuration(job)}
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              {expanded.includes(job.id) && (
                <CardContent>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  {job.result != null && (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs">
                      <strong>完成结果：</strong> {explainResult(job.result)}
                    </div>
                  )}
                  <div className="mt-4 max-h-44 overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs text-muted-foreground">
                    {job.events.length ? (
                      job.events.map((e) => (
                        <div key={e.id} className="py-1">
                          {new Date(e.createdAt).toLocaleTimeString()} ·{" "}
                          {e.message}
                        </div>
                      ))
                    ) : (
                      <div className="flex items-center gap-2">
                        <RotateCcw className="size-3.5" />
                        等待 Worker 事件…
                      </div>
                    )}
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        {!query.isLoading && jobs.length === 0 && (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              没有符合筛选条件的任务。
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
