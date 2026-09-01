"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type TaskItem = {
  id: string;
  type: string;
  displayName?: string | null;
  status?: string;
  deletedAt: string;
};
type BatchItem = {
  id: string;
  name: string;
  source: string;
  count: number;
  deletedAt: string;
};

export default function RecycleBinPage() {
  const client = useQueryClient();
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  useEffect(() => {
    setTasks(JSON.parse(localStorage.getItem("workbench-recycle-bin") || "[]"));
  }, []);
  const saveTasks = (items: TaskItem[]) => {
    setTasks(items);
    localStorage.setItem("workbench-recycle-bin", JSON.stringify(items));
  };
  const batches = useQuery({
    queryKey: ["recycle-bin-batches"],
    queryFn: async () => {
      const response = await fetch("/api/recycle-bin");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "回收站读取失败");
      return data as BatchItem[];
    },
  });
  const batchRows = Array.isArray(batches.data) ? batches.data : [];
  const updateBatch = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "restore" | "delete" }) => {
      if (action === "delete" && !window.confirm("确定彻底删除？商品、规格、图片和修改记录将无法恢复。")) {
        return { cancelled: true };
      }
      const response = await fetch("/api/recycle-bin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "回收站操作失败");
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      void client.invalidateQueries({ queryKey: ["recycle-bin-batches"] });
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["images"] });
    },
  });
  const empty = !batches.isLoading && batchRows.length === 0 && tasks.length === 0;

  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="数据管理"
        title="回收站"
        description="已删除的商品批次可以恢复；彻底删除后将无法找回。"
      />
      <Card>
        <CardContent className="space-y-3 p-5">
          {batches.isLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" /> 正在读取回收站…
            </p>
          )}
          {empty && <p className="text-sm text-muted-foreground">回收站为空</p>}
          {batchRows.map((item) => (
            <div key={`batch-${item.id}`} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.name}</p>
                <p className="text-xs text-muted-foreground">
                  商品批次 · {item.count} 条商品 · {new Date(item.deletedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={updateBatch.isPending} onClick={() => updateBatch.mutate({ id: item.id, action: "restore" })}>
                  <RotateCcw className="size-4" /> 恢复
                </Button>
                <Button size="sm" variant="destructive" disabled={updateBatch.isPending} onClick={() => updateBatch.mutate({ id: item.id, action: "delete" })}>
                  <Trash2 className="size-4" /> 彻底删除
                </Button>
              </div>
            </div>
          ))}
          {tasks.map((item) => (
            <div key={`task-${item.id}`} className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{item.displayName || item.type}</p>
                <p className="text-xs text-muted-foreground">
                  任务 · {item.status || "未知"} · {new Date(item.deletedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => saveTasks(tasks.filter((row) => row.id !== item.id))}>恢复</Button>
                <Button size="sm" variant="destructive" onClick={() => window.confirm("确定彻底删除？") && saveTasks(tasks.filter((row) => row.id !== item.id))}>彻底删除</Button>
              </div>
            </div>
          ))}
          {(batches.error || updateBatch.error) && (
            <p className="text-sm text-destructive">
              {batches.error?.message || updateBatch.error?.message}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
