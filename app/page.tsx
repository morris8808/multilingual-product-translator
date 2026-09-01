import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  CheckCircle2,
  Clock3,
  Database,
  Globe2,
  Images,
  Languages,
  ListTodo,
  ServerCog,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getWorkspaceContext } from "@/lib/workspace-context";
import { getTrashedImportBatches } from "@/lib/import-batch-trash";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { workspace } = await getWorkspaceContext();
  const trashedBatchIds = (await getTrashedImportBatches(workspace.id)).map(
    (item) => item.id,
  );
  const cutoff = new Date(Date.now() - 20_000);
  const [
    products,
    images,
    terms,
    batches,
    totalJobs,
    running,
    review,
    completed,
    failed,
    models,
    sites,
    workers,
    recent,
  ] = await Promise.all([
    db.productDraft.count({
      where: {
        batch: { workspaceId: workspace.id, id: { notIn: trashedBatchIds } },
      },
    }),
    db.imageAsset.count({
      where: {
        archived: false,
        product: {
          batch: { workspaceId: workspace.id, id: { notIn: trashedBatchIds } },
        },
      },
    }),
    db.term.count({ where: { workspaceId: workspace.id, enabled: true } }),
    db.importBatch.count({
      where: { workspaceId: workspace.id, id: { notIn: trashedBatchIds } },
    }),
    db.job.count({ where: { workspaceId: workspace.id } }),
    db.job.count({
      where: {
        workspaceId: workspace.id,
        status: { in: ["QUEUED", "RUNNING", "RETRYING"] },
      },
    }),
    db.job.count({ where: { workspaceId: workspace.id, status: "REVIEW" } }),
    db.job.count({ where: { workspaceId: workspace.id, status: "COMPLETED" } }),
    db.job.count({ where: { workspaceId: workspace.id, status: "FAILED" } }),
    db.modelConnection.count({
      where: { workspaceId: workspace.id, enabled: true },
    }),
    db.siteConnection.count({ where: { workspaceId: workspace.id } }),
    db.workerRuntime.count({
      where: { status: "ONLINE", heartbeatAt: { gte: cutoff } },
    }),
    db.job.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        displayName: true,
        type: true,
        status: true,
        completedItems: true,
        totalItems: true,
        createdAt: true,
      },
    }),
  ]);
  const metrics = [
    ["商品草稿", products, `${batches} 个导入批次`, Boxes, "/prepare"],
    ["图片资产", images, "可处理商品原图", Images, "/images"],
    ["启用术语", terms, "翻译时自动保护", Languages, "/terms"],
    ["后台任务", totalJobs, `${running} 个正在执行`, ListTodo, "/tasks"],
  ] as const;
  const shortcuts = [
    ["处理商品", "导入表格或从独立站拉取", "/prepare", Boxes],
    ["批量翻译", "选择字段和目标语言", "/products", Languages],
    ["处理图片", "生成、换背景和审核", "/images", Images],
    ["查看任务", "跟踪进度、失败与结果", "/tasks", ListTodo],
  ] as const;
  const moreBlocks = [
    ["独立站连接", `${sites} 个站点连接`, "/connections", Globe2],
    ["模型管理", `${models} 个启用模型`, "/models", ServerCog],
    ["术语保护", `${terms} 条启用术语`, "/terms", Languages],
    ["存储与归档", `${images} 个图片资产`, "/storage", Database],
  ] as const;
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <section className="flex flex-col justify-between gap-4 rounded-2xl bg-gradient-to-r from-primary to-blue-500 p-6 text-primary-foreground shadow-lg md:flex-row md:items-center">
        <div>
          <p className="text-sm font-medium opacity-80">运营控制台</p>
          <h1 className="mt-1 text-2xl font-bold">{workspace.name}</h1>
          <p className="mt-2 text-sm opacity-80">
            商品、翻译、图片与后台任务的实时工作概览
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-white/25 bg-white/15 text-white">
            PostgreSQL 在线
          </Badge>
          <Badge className="border-white/25 bg-white/15 text-white">
            {workers} 个 Worker 在线
          </Badge>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, note, Icon, href]) => (
          <Link key={label} href={href} className="group">
            <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary group-hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-bold">
                    {value.toLocaleString()}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {note}
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">快捷操作</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shortcuts.map(([title, text, href, Icon]) => (
            <Link
              key={title}
              href={href}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text}</p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,.6fr)]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>最近任务</CardTitle>
            <Button size="sm" variant="ghost" asChild>
              <Link href="/tasks">
                全部任务
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.map((job) => {
              const percent = job.totalItems
                ? Math.round((job.completedItems / job.totalItems) * 100)
                : 0;
              return (
                <div key={job.id} className="rounded-xl border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {job.displayName || job.type}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {job.completedItems}/{job.totalItems} ·{" "}
                        {new Date(job.createdAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <Badge
                      variant={
                        job.status === "COMPLETED" ? "success" : "outline"
                      }
                    >
                      {job.status}
                    </Badge>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {!recent.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                暂无后台任务
              </p>
            )}
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>系统状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Status icon={Database} label="PostgreSQL 数据库" ok />
              <Status
                icon={ServerCog}
                label={`后台 Worker（${workers}）`}
                ok={workers > 0}
              />
              <Status
                icon={Globe2}
                label={`独立站连接（${sites}）`}
                ok={sites > 0}
              />
              <Status
                icon={CheckCircle2}
                label={`启用模型（${models}）`}
                ok={models > 0}
              />
              {failed > 0 && (
                <Status
                  icon={TriangleAlert}
                  label={`${failed} 个失败任务待处理`}
                  ok={false}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>任务概况</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-4">
              <TaskCount label="进行中" value={running} icon={Clock3} />
              <TaskCount label="待审核" value={review} icon={Clock3} />
              <TaskCount label="已完成" value={completed} icon={CheckCircle2} />
              <TaskCount label="失败" value={failed} icon={TriangleAlert} />
            </CardContent>
          </Card>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-semibold">更多工作区</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {moreBlocks.map(([title, text, href, Icon]) => (
            <Link
              key={title}
              href={href}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary"
            >
              <Icon className="size-5 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{text}</p>
              </div>
              <ArrowRight className="ml-auto size-4 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Status({
  icon: Icon,
  label,
  ok,
}: {
  icon: typeof Database;
  label: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-3">
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <span
        className={`size-2 rounded-full ${ok ? "bg-emerald-500" : "bg-amber-500"}`}
      />
    </div>
  );
}
function TaskCount({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-lg bg-muted/60 p-3">
      <Icon className="mx-auto size-4 text-primary" />
      <p className="mt-2 text-xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
