"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  ImagePlus,
  LoaderCircle,
  History,
  Sparkles,
  Trash2,
  UploadCloud,
  Upload,
  X,
} from "lucide-react";
import { useForm } from "react-hook-form";
import React from "react";
import Link from "next/link";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const formSchema = z.object({
  modelConnectionId: z.string().min(1, "请选择图片模型"),
  operation: z.enum(["GENERATE", "BACKGROUND", "UPSCALE", "LOCALIZE"]),
  prompt: z.string().min(3, "请输入至少 3 个字的图片要求"),
});
type Form = z.infer<typeof formSchema>;
type Version = {
  id: string;
  url: string;
  operation: string;
  status: string;
  isActive: boolean;
  createdAt: string;
  syncedAt?: string | null;
};
type Asset = {
  id: string;
  sourceUrl: string;
  position: number;
  product: {
    id: string;
    sourceId: string | null;
    batchId: string;
    data: unknown;
  };
  onlineUrl: string;
  versions: Version[];
};
type Model = { id: string; name: string; provider: string; model: string };
type Batch = {
  id: string;
  name: string;
  source: string;
  _count: { products: number };
};
const productTitle = (data: unknown) =>
  data && typeof data === "object" && !Array.isArray(data)
    ? String(
        (data as Record<string, unknown>).title ||
          (data as Record<string, unknown>).name ||
          "未命名商品",
      )
    : "未命名商品";
const brokenImagePlaceholder =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect width='600' height='600' rx='24' fill='%23f1f5f9'/%3E%3Cpath d='M180 380l74-88 54 62 38-45 74 71H180z' fill='%23cbd5e1'/%3E%3Ccircle cx='390' cy='220' r='34' fill='%23cbd5e1'/%3E%3Ctext x='300' y='455' text-anchor='middle' font-family='Arial,sans-serif' font-size='24' fill='%2364758b'%3E图片无法预览%3C/text%3E%3C/svg%3E";
export default function ImagesPage() {
  const [sourceMode, setSourceMode] = React.useState("store");
  const [productBatchId, setProductBatchId] = React.useState("");
  const [targetProductId, setTargetProductId] = React.useState("");
  const [targetImageUrl, setTargetImageUrl] = React.useState("");
  const client = useQueryClient();
  const [selected, setSelected] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [previewUrl, setPreviewUrl] = React.useState<string>();
  const [historyAssets, setHistoryAssets] = React.useState<Asset[]>([]);
  const [historyMessage, setHistoryMessage] = React.useState("");
  const [deletingVersionId, setDeletingVersionId] = React.useState("");
  const [batchMessage, setBatchMessage] = React.useState("");
  const [batchPending, setBatchPending] = React.useState(false);
  const [taskOpen, setTaskOpen] = React.useState(true);
  const [filtersOpen, setFiltersOpen] = React.useState(true);
  const promptRef = React.useRef<HTMLInputElement>(null);
  const [promptHistory, setPromptHistory] = React.useState<string[]>([]);
  const [selectFrom, setSelectFrom] = React.useState(1);
  const [selectTo, setSelectTo] = React.useState(10);
  const [imageSize, setImageSize] = React.useState(300);
  const [searchText, setSearchText] = React.useState("");
  const [excludeText, setExcludeText] = React.useState("");
  const [moreFilters, setMoreFilters] = React.useState(false);
  const [sort, setSort] = React.useState("product");
  const [imageType, setImageType] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const dragging = React.useRef(false);
  const privateFilesRef = React.useRef<HTMLInputElement>(null);
  const [privateFiles, setPrivateFiles] = React.useState<File[]>([]);
  const [privateUrls, setPrivateUrls] = React.useState("");
  const [privateImporting, setPrivateImporting] = React.useState(false);
  const [versionIndexes, setVersionIndexes] = React.useState<
    Record<string, number | null>
  >({});
  const batches = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const response = await fetch("/api/import-batches");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "商品数据读取失败");
      return data as Batch[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const batchRows = React.useMemo(() => {
    const rows = Array.isArray(batches.data) ? batches.data : [];
    return rows.filter((batch) =>
      sourceMode === "private"
        ? batch.source === "PRIVATE_IMAGES"
        : batch.source !== "PRIVATE_IMAGES",
    );
  }, [batches.data, sourceMode]);
  const selectedProductBatch = batchRows.find(
    (batch) => batch.id === productBatchId,
  );
  const deleteProductBatch = useMutation({
    mutationFn: async () => {
      if (!productBatchId) throw new Error("请先选择要删除的商品数据");
      const confirmed = window.confirm(
        `确定将“${selectedProductBatch?.name || "当前商品数据"}”移到回收站吗？之后可以恢复或彻底删除。`,
      );
      if (!confirmed) return { cancelled: true };
      const response = await fetch(`/api/import-batches/${productBatchId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "商品数据删除失败");
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      setProductBatchId("");
      setSelected([]);
      setPage(1);
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["images"] });
      void client.invalidateQueries({ queryKey: ["translation-products"] });
    },
  });
  const query = useQuery({
    queryKey: [
      "images",
      page,
      statusFilter,
      searchText,
      excludeText,
      sort,
      imageType,
      dateFrom,
      dateTo,
      sourceMode,
      productBatchId,
      targetProductId,
      targetImageUrl,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        status: statusFilter,
        search: searchText,
        exclude: excludeText,
        sort,
        imageType,
        sourceMode,
      });
      if (productBatchId) params.set("batchId", productBatchId);
      if (targetProductId) params.set("productId", targetProductId);
      if (targetImageUrl) params.set("imageUrl", targetImageUrl);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(`/api/images?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "图片读取失败");
      return d as {
        images: Asset[];
        models: Model[];
        defaultImageModelId: string;
        pendingImageIds: string[];
        excludedImageIds: string[];
        preferences: {
          showOnlineProductLink: boolean;
          imagePreviewMaxWidth: number;
        };
        pagination: { page: number; pages: number; total: number };
      };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchInterval: (result) =>
      result.state.data?.pendingImageIds.length ? 3_000 : false,
  });
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSourceMode(params.get("sourceMode") || "store");
    setTargetProductId(params.get("productId") || "");
    setTargetImageUrl(params.get("imageUrl") || "");
    setPage(1);
    setSelected([]);
  }, [statusFilter]);
  React.useEffect(() => {
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, []);
  const form = useForm<Form>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      modelConnectionId: "",
      operation: "GENERATE",
      prompt: "保持商品主体、比例与品牌特征，生成干净专业的电商展示图",
    },
  });
  React.useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("image-workbench-config") || "null",
      ) as Partial<Form> | null;
      if (saved) form.reset({ ...form.getValues(), ...saved });
      setPromptHistory(
        JSON.parse(localStorage.getItem("image-prompt-history") || "[]"),
      );
      setImageSize(Number(localStorage.getItem("image-preview-size") || 300));
    } catch {}
    const subscription = form.watch((value) =>
      localStorage.setItem("image-workbench-config", JSON.stringify(value)),
    );
    return () => subscription.unsubscribe();
  }, [form]);
  React.useEffect(() => {
    const defaultModel =
      query.data?.models.find(
        (model) => model.id === query.data?.defaultImageModelId,
      ) || query.data?.models[0];
    if (defaultModel) form.setValue("modelConnectionId", defaultModel.id);
  }, [query.data?.defaultImageModelId, query.data?.models, form]);
  const create = useMutation({
    mutationFn: async (v: Form) => {
      if (!selected.length) throw new Error("请至少选择一张图片");
      const r = await fetch("/api/image-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...v, imageIds: selected }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "创建失败");
      return d;
    },
    onSuccess: (_data, values) => {
      const history = [
        values.prompt.trim(),
        ...promptHistory.filter((item) => item !== values.prompt.trim()),
      ]
        .filter(Boolean)
        .slice(0, 10);
      setPromptHistory(history);
      localStorage.setItem("image-prompt-history", JSON.stringify(history));
      setSelected([]);
      void client.invalidateQueries({ queryKey: ["images"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const archive = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/image-archive-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: selected }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "归档任务创建失败");
      return d;
    },
    onSuccess: () => setSelected([]),
  });
  const archiveAdopted = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/image-archive-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: selected, mode: "adopted" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "已采用图片归档任务创建失败");
      return d;
    },
    onSuccess: () => {
      setBatchMessage("已采用图片归档任务已提交，可在任务中心查看进度");
      setSelected([]);
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const writeback = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/image-writeback-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: selected, confirm: true }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "同步任务创建失败");
      return d;
    },
    onSuccess: () => {
      setBatchMessage("图片同步任务已提交，可前往任务中心查看进度");
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const review = async (
    id: string,
    action: "approve" | "reject" | "apply",
    refresh = true,
  ) => {
    const r = await fetch(`/api/image-versions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, confirm: action === "apply" }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "操作失败");
    if (refresh) {
      await client.invalidateQueries({ queryKey: ["images"] });
      await query.refetch();
    }
  };
  const removeVersion = async (id: string) => {
    setDeletingVersionId(id);
    setHistoryMessage("");
    try {
      const r = await fetch(`/api/image-versions/${id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "删除失败");
      setHistoryAssets((assets) =>
        assets.map((asset) => ({
          ...asset,
          versions: asset.versions.filter((version) => version.id !== id),
        })),
      );
      setVersionIndexes((current) => {
        const next = { ...current };
        for (const asset of historyAssets) {
          const deletedIndex = asset.versions.findIndex(
            (version) => version.id === id,
          );
          if (deletedIndex >= 0) {
            const currentIndex = next[asset.id];
            if (currentIndex === deletedIndex) next[asset.id] = null;
            else if (typeof currentIndex === "number" && currentIndex > deletedIndex)
              next[asset.id] = currentIndex - 1;
          }
        }
        return next;
      });
      setHistoryMessage("历史版本已删除");
      await client.invalidateQueries({ queryKey: ["images"] });
    } catch (error) {
      setHistoryMessage(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeletingVersionId("");
    }
  };
  const regenerate = (imageIds: string[]) => {
    setSelected(imageIds);
    setTaskOpen(true);
    setBatchMessage("请在上方重新输入提示词，然后点击“交给后台 Worker”");
    requestAnimationFrame(() => {
      promptRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      promptRef.current?.focus();
      promptRef.current?.select();
    });
  };
  const selectedAssets =
    query.data?.images.filter((image) => selected.includes(image.id)) || [];
  const displayedVersion = (image: Asset) => {
    const active = image.versions.find((version) => version.isActive);
    const activeIndex = image.versions.findIndex((version) => version.isActive);
    const savedIndex = versionIndexes[image.id];
    if (savedIndex === null) return undefined;
    const index = Math.min(
      savedIndex ??
        (statusFilter === "adopted" && activeIndex >= 0 ? activeIndex : 0),
      Math.max(0, image.versions.length - 1),
    );
    return image.versions[index] || active;
  };
  const batchReview = async (action: "reject" | "apply") => {
    const targets = selectedAssets
      .map((image) => displayedVersion(image))
      .filter((version): version is Version => Boolean(version));
    if (!targets.length) {
      setBatchMessage("选中的图片暂无可操作版本");
      return;
    }
    setBatchPending(true);
    setBatchMessage("");
    try {
      for (const version of targets) {
        if (action === "reject") {
          await review(version.id, "reject", false);
          continue;
        }
        await review(version.id, "apply", false);
      }
      if (action === "apply") {
        setVersionIndexes((current) => {
          const next = { ...current };
          for (const image of selectedAssets) delete next[image.id];
          return next;
        });
      }
      await client.invalidateQueries({ queryKey: ["images"] });
      await query.refetch();
      setBatchMessage(
        action === "reject"
          ? `已将 ${targets.length} 个版本标记为不采用`
          : `已确认采用 ${targets.length} 个版本`,
      );
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : "批量操作失败");
    } finally {
      setBatchPending(false);
    }
  };
  const toggleExcluded = async (action: "exclude" | "restore") => {
    if (!selected.length) {
      setBatchMessage("请先选择要处理的图片");
      return;
    }
    setBatchPending(true);
    setBatchMessage("");
    try {
      const response = await fetch("/api/images/exclusions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: selected, action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "操作失败");
      await client.invalidateQueries({ queryKey: ["images"] });
      await query.refetch();
      setBatchMessage(
        action === "exclude"
          ? `已排除 ${selected.length} 张图片`
          : `已恢复 ${selected.length} 张图片`,
      );
      setSelected([]);
    } catch (error) {
      setBatchMessage(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBatchPending(false);
    }
  };
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <div className="flex flex-wrap gap-2">
        <Button
          variant={sourceMode === "store" ? "default" : "outline"}
          asChild
        >
          <Link
            href="/images?sourceMode=store"
            onClick={() => setSourceMode("store")}
          >
            在线及表格导入商品图片
          </Link>
        </Button>
        <Button
          variant={sourceMode === "private" ? "default" : "outline"}
          asChild
        >
          <Link
            href="/images?sourceMode=private"
            onClick={() => setSourceMode("private")}
          >
            自有商品图片
          </Link>
        </Button>
      </div>
      {sourceMode === "private" && (
        <Card>
          <CardHeader>
            <CardTitle>导入自有商品图片</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="rounded-xl border-2 border-dashed p-5 text-center transition-colors hover:border-primary"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setPrivateFiles((current) => [
                  ...current,
                  ...Array.from(event.dataTransfer.files),
                ]);
              }}
            >
              <UploadCloud className="mx-auto size-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                拖入图片、XLSX、XLS 或 CSV，或点击下方按钮选择
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                图片支持
                JPG、JPEG、PNG、WebP、GIF、AVIF；表格会按行识别图片地址和商品信息。
              </p>
              <Button
                type="button"
                className="mt-4"
                onClick={() => privateFilesRef.current?.click()}
              >
                <Upload className="size-4" />
                选择本地文件
              </Button>
              <input
                ref={privateFilesRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.xlsx,.xls,.csv"
                className="sr-only"
                onChange={(event) =>
                  setPrivateFiles(Array.from(event.target.files || []))
                }
              />
              <div className="mt-3 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {privateFiles.length > 0 ? (
                  <span>已选择 {privateFiles.length} 个文件</span>
                ) : (
                  <span>暂未选择文件，也可以只在下方粘贴远程图片地址。</span>
                )}
              </div>
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                本地开发环境导入的图片会先保存在当前服务器，可直接用于后台生图任务；如果后续需要独立站或外部模型长期通过公网访问，建议到“存储归档”配置自有存储桶后再归档/分发。
              </div>
              {privateFiles.length > 0 && (
                <div className="mt-3 flex max-h-24 flex-wrap justify-center gap-1 overflow-auto">
                  {privateFiles.map((file, index) => (
                    <Badge key={`${file.name}-${index}`} variant="outline">
                      {file.name}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <textarea
              className="control min-h-24 w-full"
              value={privateUrls}
              onChange={(event) => setPrivateUrls(event.target.value)}
              placeholder="远程图片地址可换行，或使用英文逗号分隔"
            />
            <Button
              disabled={privateImporting}
              onClick={async () => {
                setPrivateImporting(true);
                setBatchMessage("");
                try {
                  const body = new FormData();
                  body.set("urls", privateUrls);
                  privateFiles.forEach((file) => body.append("files", file));
                  const response = await fetch("/api/private-images", {
                    method: "POST",
                    body,
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.error);
                  setBatchMessage(
                    `已导入 ${data.imported} 张图片，建立 ${data.products} 个商品${data.rejected ? `；${data.rejected} 个远程地址下载失败` : ""}`,
                  );
                  setPrivateUrls("");
                  setPrivateFiles([]);
                  if (privateFilesRef.current)
                    privateFilesRef.current.value = "";
                  await client.invalidateQueries({ queryKey: ["images"] });
                } catch (error) {
                  setBatchMessage(
                    error instanceof Error ? error.message : "导入失败",
                  );
                } finally {
                  setPrivateImporting(false);
                }
              }}
            >
              <Upload className="size-4" />
              {privateImporting ? "导入中…" : "上传并入库"}
            </Button>
          </CardContent>
        </Card>
      )}
      <div className="sticky top-[4.5rem] z-20 space-y-2 bg-background pb-2">
        <Card className="shadow-lg">
          <CardHeader className="py-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-left"
              onClick={() => setTaskOpen((open) => !open)}
              aria-expanded={taskOpen}
            >
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5" />
                创建图片任务
              </CardTitle>
              <ChevronDown
                className={`size-5 transition-transform ${taskOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CardHeader>
          {taskOpen && (
            <CardContent>
              <form
                className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_2fr_auto]"
                onSubmit={form.handleSubmit((v) => create.mutate(v))}
              >
                <div>
                  <Label>商品数据</Label>
                  <div className="mt-2 flex gap-2">
                    <select
                      className="control min-w-0 flex-1"
                      value={productBatchId}
                      onChange={(event) => {
                        setProductBatchId(event.target.value);
                        setPage(1);
                        setSelected([]);
                      }}
                    >
                      <option value="">全部商品数据</option>
                      {batchRows.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.name} · {batch._count.products} 条
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="icon"
                      variant="destructive"
                      disabled={!productBatchId || deleteProductBatch.isPending}
                      onClick={() => deleteProductBatch.mutate()}
                      title="将当前商品数据移到回收站"
                      aria-label="将当前商品数据移到回收站"
                    >
                      {deleteProductBatch.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>图片模型</Label>
                  <select
                    className="control mt-2 w-full"
                    {...form.register("modelConnectionId")}
                  >
                    <option value="">请选择</option>
                    {query.data?.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {m.model}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>操作</Label>
                  <select
                    className="control mt-2 w-full"
                    {...form.register("operation")}
                  >
                    <option value="GENERATE">参考图生成</option>
                    <option value="BACKGROUND">更换场景/背景</option>
                    <option value="UPSCALE">高清放大</option>
                    <option value="LOCALIZE">图片文字本地化</option>
                  </select>
                </div>
                <div>
                  <Label>生成要求</Label>
                  <Input
                    ref={(element) => {
                      form.register("prompt").ref(element);
                      promptRef.current = element;
                    }}
                    name="prompt"
                    list="image-prompt-history"
                    className="mt-2"
                    onBlur={form.register("prompt").onBlur}
                    onChange={form.register("prompt").onChange}
                  />
                  <datalist id="image-prompt-history">
                    {promptHistory.map((prompt) => (
                      <option key={prompt} value={prompt} />
                    ))}
                  </datalist>
                </div>
                <p className="text-xs text-muted-foreground md:col-span-2 xl:col-span-5">
                  已选择 {selected.length} 张；单次最多 50
                  张。刷新或关闭页面不会中断。
                </p>
                {(create.error ||
                  deleteProductBatch.error ||
                  archive.error ||
                  archiveAdopted.error ||
                  form.formState.errors.prompt ||
                  form.formState.errors.modelConnectionId) && (
                  <p className="text-sm text-destructive md:col-span-2 xl:col-span-5">
                    {create.error?.message ||
                      deleteProductBatch.error?.message ||
                      archive.error?.message ||
                      archiveAdopted.error?.message ||
                      form.formState.errors.prompt?.message ||
                      form.formState.errors.modelConnectionId?.message}
                  </p>
                )}
                <Button
                  className="w-full"
                  disabled={create.isPending || !selected.length}
                >
                  <ImagePlus className="size-4" />
                  {create.isPending ? "提交中…" : "开始优化"}
                </Button>
                <details className="md:col-span-2 xl:col-span-5">
                  <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border px-3 text-sm">
                    更多操作
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archive.isPending || !selected.length}
                      onClick={() => archive.mutate()}
                    >
                      <Database className="size-4" />
                      {archive.isPending ? "提交归档…" : "归档远端原图"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={archiveAdopted.isPending || !selected.length}
                      onClick={() => archiveAdopted.mutate()}
                    >
                      <Database className="size-4" />
                      {archiveAdopted.isPending ? "提交归档…" : "归档已采用图片"}
                    </Button>
                  </div>
                </details>
              </form>
            </CardContent>
          )}
        </Card>
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              共 {query.data?.pagination.total || 0} 张图片，每页最多 24 张
            </p>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              title={filtersOpen ? "收起筛选栏" : "展开筛选栏"}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <ChevronDown
                className={`size-5 transition-transform ${filtersOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </div>
          {filtersOpen && (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
            <select
              className="control h-9 w-auto py-1 text-sm"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">全部图片</option>
              <option value="adopted">已采用</option>
              <option value="unadopted">未采用</option>
              <option value="review">待审核</option>
              <option value="processing">处理中</option>
              <option value="failed">处理失败</option>
              <option value="success">生成成功</option>
              <option value="sync_success">同步独立站成功</option>
              <option value="sync_failed">同步独立站失败</option>
              <option value="excluded">已排除图片</option>
            </select>
            <Input
              className="h-9 w-44"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索任意商品字段"
            />
            <Input
              className="h-9 w-40"
              value={excludeText}
              onChange={(event) => setExcludeText(event.target.value)}
              placeholder="排除关键词"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMoreFilters((value) => !value)}
            >
              更多筛选
            </Button>
            <div className="flex items-center gap-1 rounded-md border px-2">
              <Input
                className="h-7 w-14 border-0 px-1"
                type="number"
                min={1}
                value={selectFrom}
                onChange={(event) => setSelectFrom(Number(event.target.value))}
              />
              <span className="text-xs text-muted-foreground">至</span>
              <Input
                className="h-7 w-14 border-0 px-1"
                type="number"
                min={1}
                value={selectTo}
                onChange={(event) => setSelectTo(Number(event.target.value))}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const first = Math.min(selectFrom, selectTo);
                  const last = Math.max(selectFrom, selectTo);
                  const pageStart = (page - 1) * 24 + 1;
                  const ids = (query.data?.images || [])
                    .filter((_image, index) => {
                      const ordinal = pageStart + index;
                      return ordinal >= first && ordinal <= last;
                    })
                    .map((image) => image.id);
                  setSelected(ids);
                  setBatchMessage(
                    ids.length
                      ? `已选择编号 ${first}–${last} 中当前页的 ${ids.length} 张图片`
                      : "该编号范围不在当前页",
                  );
                }}
              >
                选择编号
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const ids = query.data?.images.map((image) => image.id) || [];
                setSelected(
                  ids.every((id) => selected.includes(id)) ? [] : ids,
                );
              }}
            >
              {query.data?.images.every((image) => selected.includes(image.id))
                ? "取消本页全选"
                : "本页全选"}
            </Button>
            <Button
              size="sm"
              disabled={!selected.length || batchPending}
              onClick={() => void batchReview("apply")}
            >
              <Check className="size-4" />
              确认采用
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={writeback.isPending}
              onClick={() => {
                if (!selected.length) {
                  setStatusFilter("adopted");
                  setBatchMessage(
                    "已筛选已采用图片，请选择需要同步的图片后再次点击同步",
                  );
                } else writeback.mutate();
              }}
            >
              <UploadCloud className="size-4" />
              {sourceMode === "private" ? "自有图片仅支持导出" : writeback.isPending ? "提交中…" : "同步已采用图片到独立站"}
            </Button>
            <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border px-3 text-sm">
                更多操作
              </summary>
              <div className="absolute left-0 top-11 z-30 flex min-w-max flex-wrap gap-2 rounded-lg border bg-card p-2 shadow-xl">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.length}
                  onClick={() => setHistoryAssets(selectedAssets)}
                >
                  <History className="size-4" />
                  历史
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.length || batchPending}
                  onClick={() => void regenerate(selected)}
                >
                  <Sparkles className="size-4" />
                  重新生成
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.length || batchPending}
                  onClick={() => void batchReview("reject")}
                >
                  <X className="size-4" />
                  不采用
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selected.length || batchPending}
                  onClick={() => void toggleExcluded("exclude")}
                >
                  排除选中图片
                </Button>
                {statusFilter === "excluded" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selected.length || batchPending}
                    onClick={() => void toggleExcluded("restore")}
                  >
                    恢复选中图片
                  </Button>
                )}
                {(Object.keys(versionIndexes).length > 0 ||
                  Boolean(
                    query.data?.images.some(
                      (image) => image.versions.length > 1,
                    ),
                  )) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setVersionIndexes((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          selected.map((imageId) => [imageId, null]),
                        ),
                      }));
                      setBatchMessage(
                        selected.length
                          ? `已清空 ${selected.length} 张选中图片的版本预览`
                          : "请先选择图片，再清空对应版本预览",
                      );
                    }}
                  >
                    清空所选图片版本图
                  </Button>
                )}
                <label className="flex items-center gap-2 rounded-md border px-2 text-xs text-muted-foreground">
                  预览大小
                  <input
                    type="range"
                    min="180"
                    max="440"
                    step="20"
                    value={imageSize}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setImageSize(value);
                      localStorage.setItem("image-preview-size", String(value));
                    }}
                  />
                </label>
              </div>
            </details>
              </div>
              {moreFilters && (
                <div className="mt-3 grid w-full gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                className="control"
                value={sort}
                onChange={(event) => setSort(event.target.value)}
              >
                <option value="product">按商品顺序</option>
                <option value="recent">按最近生图任务</option>
              </select>
              <select
                className="control"
                value={imageType}
                onChange={(event) => setImageType(event.target.value)}
              >
                <option value="all">全部图片类型</option>
                <option value="product">商品主图</option>
                <option value="variant">规格/附加图</option>
              </select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                title="任务开始日期"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                title="任务结束日期"
              />
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {batchMessage && (
        <p className="rounded-lg border bg-card px-3 py-2 text-sm">
          {batchMessage}
        </p>
      )}
      <div className="grid gap-5">
        <div
          className="grid content-start gap-4"
          style={{
            gridTemplateColumns: `repeat(auto-fill, minmax(${imageSize}px, 1fr))`,
          }}
        >
          {query.data?.images.map((image) => {
            const pending = query.data.pendingImageIds.includes(image.id);
            const active = image.versions.find((v) => v.isActive);
            const activeIndex = Math.max(
              0,
              image.versions.findIndex((v) => v.isActive),
            );
            const savedVersionIndex = versionIndexes[image.id];
            const versionIndex =
              savedVersionIndex === null
                ? -1
                : Math.min(
                    savedVersionIndex ??
                      (statusFilter === "adopted" ? activeIndex : 0),
                    Math.max(0, image.versions.length - 1),
                  );
            const displayVersion =
              versionIndex >= 0 ? image.versions[versionIndex] || active : null;
            const primaryImageUrl = active?.url || `/api/images/${image.id}/source`;
            return (
              <Card
                key={image.id}
                className={`relative overflow-hidden ${pending ? "pointer-events-none grayscale" : ""} ${selected.includes(image.id) ? "border-primary ring-2 ring-primary/15" : ""}`}
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("a,button,input")) return;
                  dragging.current = true;
                  setSelected((current) =>
                    current.includes(image.id)
                      ? current.filter((id) => id !== image.id)
                      : [...current, image.id],
                  );
                }}
                onPointerEnter={() => {
                  if (dragging.current)
                    setSelected((current) =>
                      current.includes(image.id)
                        ? current
                        : [...current, image.id],
                    );
                }}
              >
                {pending && (
                  <div className="absolute inset-0 z-30 grid place-items-center bg-muted/80 backdrop-blur-[1px]">
                    <div className="rounded-lg border bg-card px-5 py-3 text-center shadow-lg">
                      <LoaderCircle className="mx-auto size-5 animate-spin text-primary" />
                      <p className="mt-2 text-sm font-medium">生成中请稍后</p>
                    </div>
                  </div>
                )}
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        <Link
                          className="hover:text-primary hover:underline"
                          href={`/prepare?batchId=${image.product.batchId}&productId=${image.product.id}`}
                        >
                          {productTitle(image.product.data)}
                        </Link>
                      </CardTitle>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        SKU：
                        {String(
                          (image.product.data as Record<string, unknown>)
                            ?.sku ||
                            (image.product.data as Record<string, unknown>)
                              ?.spu ||
                            "未设置",
                        )}{" "}
                        · {image.product.sourceId || image.product.id} · 图{" "}
                        {image.position + 1}
                      </p>
                      {query.data?.preferences.showOnlineProductLink &&
                        image.onlineUrl && (
                          <a
                            href={image.onlineUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-block text-xs text-primary hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            查看在线商品 ↗
                          </a>
                        )}
                      {active?.syncedAt && (
                        <p className="mt-1 text-[10px] text-emerald-600">
                          已同步 · {new Date(active.syncedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={selected.includes(image.id)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(image.id)
                            ? s.filter((id) => id !== image.id)
                            : [...s, image.id],
                        )
                      }
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <figure>
                      <figcaption className="mb-1 whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">
                        {active ? "已采用图片" : "原图"}
                      </figcaption>
                      <img
                        src={primaryImageUrl}
                        alt={active ? "已采用图片" : "商品原图"}
                        className="aspect-square w-full cursor-zoom-in rounded-lg border object-contain"
                        onError={(event) => {
                          event.currentTarget.src = brokenImagePlaceholder;
                          event.currentTarget.classList.add("bg-muted");
                        }}
                        onClick={() => setPreviewUrl(primaryImageUrl)}
                      />
                    </figure>
                    <figure>
                      <figcaption className="mb-1 whitespace-nowrap text-[10px] text-muted-foreground sm:text-xs">
                        {versionIndex < 0
                          ? "版本预览已清空"
                          : displayVersion?.isActive
                          ? "当前采用"
                          : image.versions.length
                            ? `历史版本 ${versionIndex + 1}/${image.versions.length}`
                            : "最新生成"}
                      </figcaption>
                      {displayVersion ? (
                        <div className="relative">
                          <img
                            src={displayVersion.url}
                            alt="生成版本"
                            className="aspect-square w-full cursor-zoom-in rounded-lg border object-contain"
                            onError={(event) => {
                              event.currentTarget.src = brokenImagePlaceholder;
                              event.currentTarget.classList.add("bg-muted");
                            }}
                            onClick={() => setPreviewUrl(displayVersion.url)}
                          />
                          {displayVersion.isActive && (
                            <Badge
                              variant="success"
                              className="absolute right-2 top-2"
                            >
                              当前
                            </Badge>
                          )}
                          {image.versions.length > 1 && (
                            <>
                              <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="absolute left-1 top-1/2 size-8 -translate-y-1/2"
                                onClick={() =>
                                  setVersionIndexes((current) => ({
                                    ...current,
                                    [image.id]:
                                      ((versionIndex < 0 ? 0 : versionIndex) -
                                        1 +
                                        image.versions.length) %
                                      image.versions.length,
                                  }))
                                }
                              >
                                <ChevronLeft className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="secondary"
                                className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                                onClick={() =>
                                  setVersionIndexes((current) => ({
                                    ...current,
                                    [image.id]:
                                      ((versionIndex < 0 ? 0 : versionIndex) + 1) %
                                      image.versions.length,
                                  }))
                                }
                              >
                                <ChevronRight className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="grid aspect-square place-items-center rounded-lg border bg-muted text-xs text-muted-foreground">
                          暂无版本
                        </div>
                      )}
                    </figure>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {query.data?.images.length === 0 && (
            <Card className="sm:col-span-2">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                还没有图片资产。请先在商品处理页拉取商品详情。
              </CardContent>
            </Card>
          )}
          {(query.data?.pagination.pages || 1) > 1 && (
            <div className="flex items-center justify-center gap-3 sm:col-span-2 2xl:col-span-3">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft className="size-4" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground">
                第 {page} / {query.data?.pagination.pages} 页
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  page >= (query.data?.pagination.pages || 1) ||
                  query.isFetching
                }
                onClick={() => setPage((value) => value + 1)}
              >
                下一页
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {previewUrl && (
        <div
          className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-6"
          onClick={() => setPreviewUrl(undefined)}
        >
          <button className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white">
            <X className="size-6" />
          </button>
          <img
            src={previewUrl}
            alt="图片大图预览"
            className="max-h-full rounded-xl object-contain"
            style={{
              maxWidth: `${query.data?.preferences.imagePreviewMaxWidth || 860}px`,
              width: "100%",
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
      {historyAssets.length > 0 && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setHistoryAssets([])}
          />
          <Card className="fixed inset-y-5 right-5 z-50 w-[min(720px,calc(100vw-2.5rem))] overflow-auto shadow-2xl">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>图片处理历史</CardTitle>
                  <p className="mt-2 text-sm text-muted-foreground">
                    已选择 {historyAssets.length} 张图片，共{" "}
                    {historyAssets.reduce(
                      (total, asset) => total + asset.versions.length,
                      0,
                    )}{" "}
                    个版本
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setHistoryAssets([])}>
                  <X className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {historyMessage && (
                <p className="rounded-lg border bg-muted px-3 py-2 text-sm sm:col-span-2">
                  {historyMessage}
                </p>
              )}
              {historyAssets.flatMap((asset) =>
                asset.versions.map((version) => (
                  <div key={version.id} className="rounded-xl border p-3">
                    <img
                      src={version.url}
                      alt="处理历史版本"
                      className="aspect-square w-full cursor-zoom-in rounded-lg object-contain"
                      onError={(event) => {
                        event.currentTarget.src = brokenImagePlaceholder;
                        event.currentTarget.classList.add("bg-muted");
                      }}
                      onClick={() => setPreviewUrl(version.url)}
                    />
                    <p className="mt-2 truncate text-xs font-medium">
                      {productTitle(asset.product.data)} · 图{" "}
                      {asset.position + 1}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {version.operation}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(version.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <Badge variant={version.isActive ? "success" : "outline"}>
                        {version.isActive ? "当前" : version.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void regenerate([asset.id])}
                      >
                        <Sparkles className="size-3" />
                        重新生成
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={
                          version.isActive || deletingVersionId === version.id
                        }
                        onClick={() => {
                          if (
                            window.confirm(
                              "确定删除这个历史版本吗？对应的本地文件或自有存储对象也会被永久删除。",
                            )
                          )
                            void removeVersion(version.id);
                        }}
                      >
                        <Trash2 className="size-3" />
                        {deletingVersionId === version.id ? "删除中…" : "删除"}
                      </Button>
                    </div>
                  </div>
                )),
              )}
              {!historyAssets.some((asset) => asset.versions.length) && (
                <p className="text-sm text-muted-foreground">暂无处理历史</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
