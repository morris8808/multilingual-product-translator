"use client";

import { useEffect, useState } from "react";

const PURGE_PHRASE =
  "我已经知晓此操作会清空网站数据库已上传的所有数据和远程存储桶数据，无法恢复";

type Preview = {
  batches: number;
  products: number;
  images: number;
  jobs: number;
};
type PurgeJob = {
  id: string;
  status: string;
  totalItems: number;
  completedItems: number;
  result?: Record<string, unknown> | null;
};

export function DataPurgePanel({ role }: { role: string }) {
  const [phrase, setPhrase] = useState("");
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<PurgeJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = role === "ADMIN" || role === "DEVELOPER";

  useEffect(() => {
    if (!job || ["COMPLETED", "FAILED", "CANCELLED"].includes(job.status))
      return;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      if (!response.ok) return;
      const jobs = (await response.json()) as PurgeJob[];
      const current = jobs.find((item) => item.id === job.id);
      if (current) setJob(current);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [job]);

  if (!allowed) return null;

  async function submit(action: "prepare" | "execute") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, phrase, token }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败");
      if (action === "prepare") {
        setToken(result.token);
        setPreview(result.preview);
      } else {
        setJob(result);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  const progress = job
    ? Math.round((job.completedItems / Math.max(1, job.totalItems)) * 100)
    : 0;

  return (
    <section className="rounded-2xl border border-red-200 bg-red-50/60 p-6 dark:border-red-900 dark:bg-red-950/20">
      <p className="text-xs font-semibold uppercase tracking-widest text-red-600">
        管理员危险操作
      </p>
      <h2 className="mt-2 text-lg font-semibold">清空当前工作区上传数据</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        清理商品、表格、图片、术语、内容与历史任务，并删除系统已经记录的远程归档对象。本操作不会删除账号、模型、站点连接、存储连接和系统设置。
      </p>

      {!preview && !job ? (
        <div className="mt-5 space-y-3">
          <p className="text-sm font-medium">
            请使用键盘逐字输入下方声明（已禁止粘贴和拖入）：
          </p>
          <p className="rounded-xl border border-red-200 bg-white p-3 text-sm text-red-700 dark:border-red-900 dark:bg-slate-950">
            {PURGE_PHRASE}
          </p>
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm outline-none focus:border-red-500 dark:border-slate-700 dark:bg-slate-950"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            onPaste={(event) => event.preventDefault()}
            onDrop={(event) => event.preventDefault()}
            onBeforeInput={(event) => {
              if (
                (event.nativeEvent as InputEvent).inputType?.includes("Paste")
              )
                event.preventDefault();
            }}
          />
          <button
            type="button"
            disabled={busy || phrase !== PURGE_PHRASE}
            onClick={() => void submit("prepare")}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "正在核验…" : "下一步：核验清理范围"}
          </button>
        </div>
      ) : null}

      {preview && !job ? (
        <div className="mt-5 rounded-2xl border-2 border-red-600 bg-red-100 p-5 dark:bg-red-950/50">
          <h3 className="text-lg font-bold text-red-700 dark:text-red-300">
            最终警告：执行后无法恢复
          </h3>
          <p className="mt-2 text-sm">
            即将清理 {preview.batches} 个批次、{preview.products} 个商品、
            {preview.images} 张图片和 {preview.jobs} 条历史任务。
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit("execute")}
              className="rounded-lg bg-red-700 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy ? "正在创建清理任务…" : "确定清空所有上传数据"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setToken("");
                setPhrase("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium dark:border-slate-700 dark:bg-slate-900"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      {job ? (
        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-sm">
            <span>清理进度 · {job.status}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-red-100 dark:bg-red-950">
            <div
              className="h-full bg-red-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-slate-500">
            已完成 {job.completedItems}/{job.totalItems}{" "}
            个阶段，可在任务中心查看详细日志。
          </p>
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-medium text-red-600">{error}</p>
      ) : null}
    </section>
  );
}
