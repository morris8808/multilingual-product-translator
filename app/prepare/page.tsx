"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Columns3,
  DownloadCloud,
  FileSpreadsheet,
  History,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
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
import {
  DEFAULT_PRODUCT_FIELDS,
  PRODUCT_FIELD_META,
} from "@/lib/product-fields";
import {
  fieldDefinitionSchema,
  type FieldDefinitionInput,
} from "@/lib/schemas/products";
type Batch = {
  id: string;
  name: string;
  source: string;
  headers: unknown;
  createdAt: string;
  _count: { products: number };
};
type Product = { id: string; rowIndex: number; data: Record<string, unknown> };
type VariantRow = {
  id: string;
  sourceId: string | null;
  data: Record<string, unknown>;
  product: Product & { sourceId: string | null };
};
const variantImageUrl = (variant: VariantRow) => {
  const data = variant.data || {};
  const direct = data.image_url || data.imageUrl || data.image || data.featured_image;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const row = direct as Record<string, unknown>;
    const url = row.url || row.src || row.image_url;
    if (typeof url === "string") return url;
  }
  const images = [variant.product.data.images, variant.product.data.product_images, variant.product.data.image_list]
    .find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  if (!images?.length) return "";
  const imageId = String(data.image_id || data.imageId || "");
  const match = images.find((image) => imageId && String(image.id || image.image_id || "") === imageId) || images[0];
  return String(match.url || match.src || match.image_url || "");
};
type ProductsResponse = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
  headers: unknown;
};
type FieldRow = FieldDefinitionInput & { id: string };
type SiteRow = {
  id: string;
  name: string;
  platform: string;
  hasToken: boolean;
};
type TextModel = {
  id: string;
  name: string;
  provider: string;
  model: string;
  kind: string;
  enabled: boolean;
};
const fieldDefaults: FieldDefinitionInput = {
  key: "",
  label: "",
  type: "TEXT",
  position: 0,
  hidden: false,
  frozen: false,
  defaultValue: "",
};
export default function PreparePage() {
  const client = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const autoSavingField = useRef(false);
  const [batchId, setBatchId] = useState("");
  const [targetProductId, setTargetProductId] = useState("");
  const [page, setPage] = useState(1);
  const [tableMode, setTableMode] = useState<"products" | "variants">(
    "products",
  );
  const [tableFullScreen, setTableFullScreen] = useState(false);
  const [hiddenHeaders, setHiddenHeaders] = useState<string[]>([]);
  const [uploadError, setUploadError] = useState("");
  const [imageImportPrompt, setImageImportPrompt] = useState<{
    file: File;
    message: string;
    columns: Array<{ header: string; count: number }>;
  }>();
  const [writebackMessage, setWritebackMessage] = useState("");
  const [siteId, setSiteId] = useState("");
  const [fieldPanelOpen, setFieldPanelOpen] = useState(false);
  const [searchPanelOpen, setSearchPanelOpen] = useState(false);
  const [autoLoadingVariants, setAutoLoadingVariants] = useState(false);
  const autoLoadedVariantBatches = useRef(new Set<string>());
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [quickSelected, setQuickSelected] = useState<string[]>([]);
  const [quickType, setQuickType] = useState<FieldDefinitionInput["type"]>("TEXT");
  const [quickRuleKind, setQuickRuleKind] = useState("NONE");
  const [quickRuleValue, setQuickRuleValue] = useState("");
  const [fieldJobId, setFieldJobId] = useState("");
  const completedFieldJob = useRef("");
  const [quality, setQuality] = useState<{
    checked: number;
    errors: number;
    warnings: number;
    issues: Array<{
      productId: string;
      rowIndex: number;
      field: string;
      message: string;
      severity: string;
    }>;
  }>();
  const [replace, setReplace] = useState({
    field: "title",
    search: "",
    replacement: "",
    mode: "contains" as "contains" | "exact" | "regex",
    caseSensitive: false,
  });
  const [fieldScope, setFieldScope] = useState<"page" | "range" | "all">(
    "page",
  );
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(20);
  const [historyProduct, setHistoryProduct] = useState<Product>();
  const [changes, setChanges] = useState<
    Array<{
      id: string;
      action: string;
      field: string | null;
      before: unknown;
      after: unknown;
      undoneAt: string | null;
      createdAt: string;
    }>
  >([]);
  const batches = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const r = await fetch("/api/import-batches");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "批次读取失败");
      return data as Batch[];
    },
  });
  const batchRows = Array.isArray(batches.data) ? batches.data : [];
  const currentBatch = batchRows.find((batch) => batch.id === batchId);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedBatch = params.get("batchId") || "";
    const linkedProduct = params.get("productId") || "";
    if (linkedProduct) setTargetProductId(linkedProduct);
    if (
      !batchId &&
      linkedBatch &&
      batchRows.some((batch) => batch.id === linkedBatch)
    )
      setBatchId(linkedBatch);
    else if (!batchId && batchRows[0]) setBatchId(batchRows[0].id);
  }, [batchRows, batchId]);
  const products = useQuery({
    queryKey: ["batch-products", batchId, page, targetProductId],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const r = await fetch(
        `/api/import-batches/${batchId}/products?page=${page}&pageSize=20${targetProductId ? `&productId=${targetProductId}` : ""}`,
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "商品读取失败");
      return data as ProductsResponse;
    },
  });
  const fields = useQuery({
    queryKey: ["fields"],
    queryFn: async () => {
      const r = await fetch("/api/fields");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "字段读取失败");
      return data as FieldRow[];
    },
  });
  const variants = useQuery({
    queryKey: ["batch-variants", batchId],
    enabled: Boolean(batchId) && tableMode === "variants",
    queryFn: async () => {
      const response = await fetch(`/api/import-batches/${batchId}/variants`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "规格读取失败");
      return data as { rows: VariantRow[]; headers: string[] };
    },
  });
  useEffect(() => {
    if (
      tableMode !== "variants" ||
      !batchId ||
      variants.isLoading ||
      variants.data?.rows.length ||
      !currentBatch?.source.startsWith("FECIFY:") ||
      autoLoadedVariantBatches.current.has(batchId)
    ) return;
    autoLoadedVariantBatches.current.add(batchId);
    void (async () => {
      setAutoLoadingVariants(true);
      setUploadError("");
      try {
        const response = await fetch(`/api/import-batches/${batchId}/products?idsOnly=1`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "商品列表读取失败");
        const ids = Array.isArray(data.ids) ? data.ids.map(String) : [];
        for (let index = 0; index < ids.length; index += 4) {
          await Promise.all(ids.slice(index, index + 4).map(async (productId: string) => {
            const detailResponse = await fetch(`/api/products/${productId}/details`, { method: "POST" });
            if (!detailResponse.ok) {
              const detailData = await detailResponse.json().catch(() => ({}));
              throw new Error(detailData.error || "规格加载失败");
            }
          }));
        }
        await client.invalidateQueries({ queryKey: ["batch-variants", batchId] });
        await client.invalidateQueries({ queryKey: ["batch-products", batchId] });
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : "规格自动加载失败");
      } finally {
        setAutoLoadingVariants(false);
      }
    })();
  }, [batchId, client, currentBatch?.source, tableMode, variants.data?.rows.length, variants.isLoading]);
  const sites = useQuery({
    queryKey: ["site-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/sites");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "站点读取失败");
      return data as SiteRow[];
    },
  });
  const textModels = useQuery({
    queryKey: ["model-connections"],
    queryFn: async () => {
      const response = await fetch("/api/connections/models");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "模型读取失败");
      return (data as TextModel[]).filter(
        (model) => model.kind === "TEXT" && model.enabled,
      );
    },
  });
  const siteRows = Array.isArray(sites.data) ? sites.data : [];
  const fieldRows = Array.isArray(fields.data) ? fields.data : [];
  useEffect(() => {
    const first = siteRows.find(
      (site) => ["fecify", "jofshop"].includes(site.platform.toLowerCase()) && site.hasToken,
    );
    if (!siteId && first) setSiteId(first.id);
  }, [siteRows, siteId]);
  const upload = useMutation({
    mutationFn: async ({
      file,
      importImages = false,
      ignoreImagePrompt = false,
    }: {
      file: File;
      importImages?: boolean;
      ignoreImagePrompt?: boolean;
    }) => {
      const body = new FormData();
      body.set("file", file);
      if (importImages) body.set("importImages", "true");
      if (ignoreImagePrompt) body.set("ignoreImagePrompt", "true");
      const r = await fetch("/api/import-batches", { method: "POST", body });
      const data = await r.json();
      if (!r.ok) {
        if (data.code === "IMAGE_LINKS_DETECTED")
          throw Object.assign(new Error(data.error || "检测到图片链接"), {
            code: data.code,
            file,
            columns: data.imageColumns || [],
          });
        throw new Error(data.error || "导入失败");
      }
      return data;
    },
    onSuccess: (data) => {
      setBatchId(data.id);
      setPage(1);
      setUploadError("");
      setImageImportPrompt(undefined);
      if (data.imageAttachmentMode) {
        setWritebackMessage(
          `已按附件模式导入图片链接，可前往商品图片工作台编辑处理。`,
        );
      }
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["batch-products"] });
    },
    onError: (error) => {
      if (
        error instanceof Error &&
        (error as Error & { code?: string }).code === "IMAGE_LINKS_DETECTED"
      ) {
        const detail = error as Error & {
          file?: File;
          columns?: Array<{ header: string; count: number }>;
        };
        if (detail.file)
          setImageImportPrompt({
            file: detail.file,
            message: error.message,
            columns: detail.columns || [],
          });
        setUploadError("");
        return;
      }
      setUploadError(error.message);
    },
  });
  const fecifyImport = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/fecify/products/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteConnectionId: siteId,
          page: 1,
          pageSize: 50,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "独立站商品拉取失败");
      return data;
    },
    onSuccess: (data) => {
      setBatchId(data.id);
      setPage(1);
      setUploadError("");
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["batch-products"] });
    },
    onError: (error) => setUploadError(error.message),
  });
  const deleteBatch = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error("请先选择要删除的批次");
      const current = batchRows.find((batch) => batch.id === batchId);
      const ok = window.confirm(
        `确定将批次“${current?.name || "当前批次"}”移到回收站吗？之后可以恢复或彻底删除。`,
      );
      if (!ok) return { cancelled: true };
      const response = await fetch(`/api/import-batches/${batchId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "批次删除失败");
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      const next = batchRows.find((batch) => batch.id !== batchId);
      setBatchId(next?.id || "");
      setPage(1);
      setUploadError("");
      setWritebackMessage("批次已移到回收站");
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["batch-products"] });
      void client.invalidateQueries({ queryKey: ["batch-variants"] });
    },
    onError: (error) => setUploadError(error.message),
  });
  const qualityCheck = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/import-batches/${batchId}/quality`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "质量检查失败");
      return data;
    },
    onSuccess: (data) => setQuality(data),
  });
  const bulkReplace = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `/api/import-batches/${batchId}/bulk-replace`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(replace),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "批量替换失败");
      return data as { changed: number };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["batch-products", batchId] });
      void qualityCheck.mutateAsync();
    },
  });
  const form = useForm<FieldDefinitionInput>({
    resolver: zodResolver(fieldDefinitionSchema),
    defaultValues: fieldDefaults,
  });
  const [executionRuleKind, setExecutionRuleKind] = useState("");
  const [defaultAiModel, setDefaultAiModel] = useState("");
  useEffect(
    () => setDefaultAiModel(localStorage.getItem("field-ai-model") || ""),
    [],
  );
  useEffect(() => {
    if (
      executionRuleKind === "AI" &&
      defaultAiModel &&
      !form.getValues("rule.config.modelConnectionId")
    ) {
      form.setValue("rule.config.modelConnectionId", defaultAiModel);
    }
  }, [defaultAiModel, executionRuleKind, form]);
  useEffect(() => {
    const productId = new URLSearchParams(window.location.search).get(
      "productId",
    );
    if (
      !productId ||
      !products.data?.items.some((item) => item.id === productId)
    )
      return;
    requestAnimationFrame(() =>
      document
        .getElementById(`product-${productId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  }, [products.data?.items]);
  const saveField = useMutation({
    mutationFn: async (data: FieldDefinitionInput) => {
      const r = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "字段保存失败");
      return result;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["fields"] });
      if (autoSavingField.current) {
        autoSavingField.current = false;
        return;
      }
      form.reset({
        ...fieldDefaults,
        position: fieldRows.length + 1,
      });
      setFieldPanelOpen(false);
    },
  });
  const bulkSaveFields = useMutation({
    mutationFn: async () => {
      const selectedFields = fieldRows.filter((field) => quickSelected.includes(field.id));
      if (!selectedFields.length) throw new Error("请至少选择一个字段");
      for (const field of selectedFields) {
        const config =
          quickRuleKind === "AI"
            ? { prompt: quickRuleValue, modelConnectionId: defaultAiModel }
            : quickRuleKind === "COPY" || quickRuleKind === "REFERENCE"
              ? { sourceKey: quickRuleValue }
              : quickRuleKind === "TEMPLATE"
                ? { template: quickRuleValue }
                : quickRuleKind === "FORMULA"
                  ? { formula: quickRuleValue }
                  : {};
        const response = await fetch("/api/fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...field,
            type: quickType,
            rule: quickRuleKind === "NONE" ? undefined : { kind: quickRuleKind, config },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`${field.label}：${result.error || "保存失败"}`);
      }
      return selectedFields.length;
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["fields"] });
      setQuickSelected([]);
    },
  });
  const runField = useMutation({
    mutationFn: async () => {
      const fieldResponse = await fetch("/api/fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.getValues()),
      });
      const savedField = await fieldResponse.json();
      if (!fieldResponse.ok)
        throw new Error(savedField.error || "请先正确保存字段设置");
      const response = await fetch("/api/product-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId,
          fieldId: savedField.id,
          productIds:
            fieldScope === "page"
              ? products.data?.items.map((item) => item.id)
              : undefined,
          rangeStart: fieldScope === "range" ? rangeStart : undefined,
          rangeEnd: fieldScope === "range" ? rangeEnd : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "字段任务创建失败");
      return data;
    },
    onSuccess: (job) => {
      setFieldJobId(job.id);
      void client.invalidateQueries({ queryKey: ["fields"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const fieldJob = useQuery({
    queryKey: ["field-job", fieldJobId],
    enabled: Boolean(fieldJobId),
    queryFn: async () => {
      const response = await fetch(`/api/jobs/${fieldJobId}`, {
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "字段任务读取失败");
      return data as {
        id: string;
        status: string;
        totalItems: number;
        completedItems: number;
        failedItems: number;
        result: { processed?: number; fieldKey?: string } | null;
        events: Array<{ id: string; message: string }>;
      };
    },
    refetchInterval: (query) =>
      query.state.data &&
      ["COMPLETED", "FAILED", "CANCELLED", "PARTIALLY_COMPLETED"].includes(
        query.state.data.status,
      )
        ? false
        : 2000,
  });
  useEffect(() => {
    if (
      !fieldJob.data ||
      !["COMPLETED", "PARTIALLY_COMPLETED"].includes(fieldJob.data.status) ||
      completedFieldJob.current === fieldJob.data.id
    )
      return;
    completedFieldJob.current = fieldJob.data.id;
    void client.invalidateQueries({ queryKey: ["batch-products", batchId] });
  }, [batchId, client, fieldJob.data]);
  const rawHeaders = Array.isArray(products.data?.headers)
    ? products.data.headers.map(String)
    : [];
  const headers = useMemo(
    () =>
      Array.from(
        new Set([
          ...rawHeaders,
          ...(fields.data || [])
            .filter((item) => !item.hidden)
            .map((item) => item.key),
        ]),
      ),
    [rawHeaders, fields.data],
  );
  const visibleHeaders = headers.filter((header) => !hiddenHeaders.includes(header));
  const allFieldsVisible = headers.length > 0 && hiddenHeaders.length === 0;
  const fieldDisplayName = (header: string) => {
    const importedField = fieldRows.find((field) => field.key === header);
    const meta = PRODUCT_FIELD_META[header];
    return {
      label: importedField?.label || meta?.label || header,
      note: meta?.description || importedField?.key || "独立站扩展商品字段",
    };
  };
  const saveCell = async (product: Product, key: string, value: string) => {
    if (String(product.data[key] ?? "") === value) return;
    await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: { ...product.data, [key]: value } }),
    });
    void client.invalidateQueries({
      queryKey: ["batch-products", batchId, page],
    });
  };
  const addRow = async () => {
    await fetch(`/api/import-batches/${batchId}/products`, { method: "POST" });
    void client.invalidateQueries({
      queryKey: ["batch-products", batchId, page],
    });
    void client.invalidateQueries({ queryKey: ["import-batches"] });
  };
  const editField = (field: FieldRow) => {
    form.reset({ ...field, rule: field.rule || undefined });
    setExecutionRuleKind(field.rule?.kind || "");
    setFieldPanelOpen(true);
  };
  const openDefaultField = (key: string) => {
    const existing = fieldRows.find((field) => field.key === key);
    if (existing) return editField(existing);
    const meta = PRODUCT_FIELD_META[key];
    form.reset({
      ...fieldDefaults,
      key,
      label: meta?.label || key,
      position: headers.length,
    });
    setExecutionRuleKind("");
    setFieldPanelOpen(true);
  };
  const newField = (position: number) => {
    form.reset({ ...fieldDefaults, position });
    setExecutionRuleKind("");
    setFieldPanelOpen(true);
  };
  const loadDetails = async (productId: string) => {
    const response = await fetch(`/api/products/${productId}/details`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) setUploadError(data.error || "商品详情拉取失败");
    else
      void client.invalidateQueries({
        queryKey: ["batch-products", batchId, page],
      });
  };
  const openHistory = async (product: Product) => {
    const response = await fetch(`/api/products/${product.id}`);
    const data = await response.json();
    if (!response.ok) setUploadError(data.error || "修改历史读取失败");
    else {
      setHistoryProduct(product);
      setChanges(data);
    }
  };
  const undoChange = async (changeId: string) => {
    if (!historyProduct) return;
    const response = await fetch(
      `/api/products/${historyProduct.id}/changes/${changeId}/undo`,
      { method: "POST" },
    );
    const data = await response.json();
    if (!response.ok) setUploadError(data.error || "撤销失败");
    else {
      await openHistory(historyProduct);
      void client.invalidateQueries({
        queryKey: ["batch-products", batchId, page],
      });
    }
  };
  const syncProcessed = async () => {
    try {
      const previewResponse = await fetch(
        `/api/import-batches/${batchId}/writeback`,
      );
      const preview = await previewResponse.json();
      if (!previewResponse.ok) throw new Error(preview.error || "同步预览失败");
      if (!preview.count) {
        setWritebackMessage("没有需要同步的字段变更");
        return;
      }
      if (
        !window.confirm(
          `将 ${preview.count} 个商品的 ${preview.fieldChanges} 个字段变更同步到独立站。原始数据和审计记录会保留，是否确认？`,
        )
      )
        return;
      const response = await fetch(`/api/import-batches/${batchId}/writeback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "同步任务创建失败");
      setWritebackMessage("已提交后台同步，可在任务中心查看进度");
    } catch (error) {
      setWritebackMessage(error instanceof Error ? error.message : "同步失败");
    }
  };
  return (
    <main className="space-y-5 p-5 lg:p-8">
      <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload.mutate({ file });
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
          >
            <Upload className="size-4" />
            {upload.isPending ? "导入中…" : "导入 XLSX / CSV"}
          </Button>
          <select
            className="control max-w-48"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
          >
            <option value="">选择独立站</option>
            {siteRows
              .filter((site) => ["fecify", "jofshop"].includes(site.platform.toLowerCase()))
              .map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
          </select>
          <Button
            variant="outline"
            disabled={!siteId || fecifyImport.isPending}
            onClick={() => fecifyImport.mutate()}
          >
            {fecifyImport.isPending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <DownloadCloud className="size-4" />
            )}
            拉取独立站商品
          </Button>
          <Button
            variant="outline"
            onClick={() => newField(fieldRows.length + 1)}
          >
            <Columns3 className="size-4" />
            新增字段
          </Button>
          <Button variant="outline" onClick={() => setQuickSettingsOpen(true)}>
            <Settings2 className="size-4" />
            字段快速设置
          </Button>
          <Button variant="outline" onClick={() => setSearchPanelOpen(true)}>
            <Search className="size-4" />
            查找替换
          </Button>
          <Button
            variant="outline"
            disabled={!batchId || qualityCheck.isPending}
            onClick={() => qualityCheck.mutate()}
          >
            <ShieldCheck className="size-4" />
            {qualityCheck.isPending ? "检查中…" : "质量检查"}
          </Button>
          <Button
            variant="outline"
            disabled={!batchId || !currentBatch?.source.startsWith("FECIFY:")}
            onClick={() => void syncProcessed()}
          >
            <UploadCloud className="size-4" />
            回传独立站
          </Button>
          <Button variant="outline" disabled={!batchId} asChild>
            <Link href={batchId ? `/products?batchId=${batchId}` : "/products"}>
              流转到商品翻译
            </Link>
          </Button>
          <Button variant="outline" disabled={!batchId} asChild>
            <Link href={batchId ? `/images?sourceMode=store` : "/images"}>
              流转到图片处理
            </Link>
          </Button>
      </div>
      {uploadError && (
        <div className="rounded-lg border border-destructive bg-destructive/5 p-3 text-sm text-destructive">
          {uploadError}
        </div>
      )}
      {imageImportPrompt && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <div className="font-medium">{imageImportPrompt.message}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {imageImportPrompt.columns
              .map((column) => `${column.header}（${column.count} 行）`)
              .join("、")}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() =>
                upload.mutate({
                  file: imageImportPrompt.file,
                  importImages: true,
                })
              }
              disabled={upload.isPending}
            >
              以附件模式导入
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                upload.mutate({
                  file: imageImportPrompt.file,
                  ignoreImagePrompt: true,
                })
              }
              disabled={upload.isPending}
            >
              普通导入
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setImageImportPrompt(undefined)}
            >
              取消
            </Button>
          </div>
        </div>
      )}
      {writebackMessage && (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          {writebackMessage}
        </div>
      )}
      {quality && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <strong>质量检查：{quality.checked} 条</strong>
              <Badge
                variant={quality.errors ? "secondary" : "success"}
                className={quality.errors ? "text-destructive" : undefined}
              >
                {quality.errors} 个错误
              </Badge>
              <Badge variant="outline">{quality.warnings} 个警告</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setQuality(undefined)}
              >
                关闭
              </Button>
            </div>
            {quality.issues.length > 0 && (
              <div className="max-h-36 overflow-auto rounded border">
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {quality.issues.slice(0, 200).map((issue, index) => (
                      <tr
                        key={`${issue.productId}-${issue.field}-${index}`}
                        className="cursor-pointer hover:bg-muted"
                        onClick={() =>
                          setPage(
                            Math.floor(
                              issue.rowIndex / (products.data?.pageSize || 20),
                            ) + 1,
                          )
                        }
                        title="跳转到问题所在分页"
                      >
                        <td className="p-2">第 {issue.rowIndex + 1} 行</td>
                        <td className="p-2 font-medium">{issue.field}</td>
                        <td className="p-2">{issue.message}</td>
                        <td className="p-2">
                          <Badge
                            variant={
                              issue.severity === "ERROR"
                                ? "secondary"
                                : "outline"
                            }
                            className={
                              issue.severity === "ERROR"
                                ? "text-destructive"
                                : undefined
                            }
                          >
                            {issue.severity}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {searchPanelOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSearchPanelOpen(false)}
        />
      )}
      {searchPanelOpen && (
        <Card className="fixed left-1/2 top-1/2 z-50 w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 shadow-2xl">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>高级查找与替换</CardTitle>
                <CardDescription className="mt-2">
                  支持包含匹配、整字段匹配和正则表达式。
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSearchPanelOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label className="mb-2 block">字段</Label>
              <select
                className="control"
                value={replace.field}
                onChange={(event) =>
                  setReplace({ ...replace, field: event.target.value })
                }
              >
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="mb-2 block">查找内容</Label>
              <Input
                value={replace.search}
                onChange={(event) =>
                  setReplace({ ...replace, search: event.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">替换为</Label>
              <Input
                value={replace.replacement}
                onChange={(event) =>
                  setReplace({ ...replace, replacement: event.target.value })
                }
              />
            </div>
            <div>
              <Label className="mb-2 block">匹配方式</Label>
              <select
                className="control"
                value={replace.mode}
                onChange={(event) =>
                  setReplace({
                    ...replace,
                    mode: event.target.value as typeof replace.mode,
                  })
                }
              >
                <option value="contains">模糊/包含查找</option>
                <option value="exact">整字段完全匹配</option>
                <option value="regex">正则表达式</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={replace.caseSensitive}
                onChange={(event) =>
                  setReplace({
                    ...replace,
                    caseSensitive: event.target.checked,
                  })
                }
              />
              区分大小写
            </label>
            <Button
              className="sm:col-span-2"
              disabled={!batchId || !replace.search || bulkReplace.isPending}
              onClick={() => bulkReplace.mutate()}
            >
              <Search className="size-4" />
              {bulkReplace.isPending ? "替换中…" : "批量替换"}
            </Button>
            {bulkReplace.data && (
              <span className="text-sm text-emerald-600">
                已修改 {bulkReplace.data.changed} 条
              </span>
            )}
            {bulkReplace.error && (
              <span className="text-sm text-destructive">
                {bulkReplace.error.message}
              </span>
            )}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5">
        <Card
          className={
            tableFullScreen
              ? "fixed inset-4 z-[70] min-w-0 overflow-auto bg-card shadow-2xl"
              : "min-w-0"
          }
        >
          <CardHeader className="pb-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)] lg:items-start">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2">
                  <FileSpreadsheet className="size-5 text-primary" />
                  {tableMode === "products" ? "商品数据表" : "规格数据表"}
                </CardTitle>
                <CardDescription className="mt-2">
                  表头固定；横向滚动；修改单元格后离开输入框即保存。
                </CardDescription>
              </div>
              <div className="flex min-w-0 flex-col gap-2 lg:items-end">
                <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
                  <Button
                    size="sm"
                    variant={tableMode === "products" ? "default" : "outline"}
                    onClick={() => setTableMode("products")}
                  >
                    商品数据表
                  </Button>
                  <Button
                    size="sm"
                    variant={tableMode === "variants" ? "default" : "outline"}
                    onClick={() => setTableMode("variants")}
                  >
                    规格数据表
                  </Button>
                  <div className="flex min-w-[260px] flex-1 gap-2 lg:max-w-md">
                    <select
                      className="control min-w-0 flex-1"
                      value={batchId}
                      onChange={(e) => {
                        setBatchId(e.target.value);
                        setPage(1);
                      }}
                    >
                      {!batchRows.length && (
                        <option value="">暂无导入批次</option>
                      )}
                      {batchRows.map((batch) => (
                        <option key={batch.id} value={batch.id}>
                          {batch.name} · {batch._count.products} 条
                        </option>
                      ))}
                    </select>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="shrink-0"
                      disabled={!batchId || deleteBatch.isPending}
                      onClick={() => deleteBatch.mutate()}
                      title="将当前批次移到回收站"
                      aria-label="将当前批次移到回收站"
                    >
                      {deleteBatch.isPending ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Trash2 className="size-4" />
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:justify-end">
                <details className="relative">
                  <summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-md border px-3 text-sm">
                    字段显示
                  </summary>
                  <div className="absolute right-0 z-30 mt-2 grid max-h-80 w-72 gap-2 overflow-auto rounded-lg border bg-card p-3 shadow-xl">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setHiddenHeaders(allFieldsVisible ? headers : [])
                      }
                    >
                      {allFieldsVisible ? "取消显示全部字段" : "显示全部字段"}
                    </Button>
                    {headers.map((header) => {
                      const field = fieldDisplayName(header);
                      return (
                        <label
                          key={header}
                          className="flex items-start gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={!hiddenHeaders.includes(header)}
                            onChange={(event) =>
                              setHiddenHeaders((current) =>
                                event.target.checked
                                  ? current.filter((item) => item !== header)
                                  : [...current, header],
                              )
                            }
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{field.label}</span>
                            <span className="block truncate text-[10px] text-muted-foreground">
                              {header} · {field.note}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </details>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTableFullScreen((value) => !value)}
                >
                  {tableFullScreen ? "退出全屏" : "表格全屏"}
                </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          {tableMode === "variants" && (
            <CardContent>
              <div className="relative h-[560px] overflow-auto rounded-lg border">
                <table className="min-w-max border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-3 text-left">商品</th>
                      <th className="p-3 text-left">商品图片</th>
                      <th className="p-3 text-left">规格 ID</th>
                      {(variants.data?.headers || []).map((header) => (
                        <th key={header} className="min-w-40 p-0 text-left">
                          <button
                            type="button"
                            className="flex w-full items-start gap-2 p-3 text-left hover:bg-primary/5"
                            onClick={() => openDefaultField(header)}
                            title="编辑字段"
                          >
                            <span className="min-w-0">
                              <span className="block truncate">
                                {fieldDisplayName(header).label}
                              </span>
                              <span className="text-[10px] font-normal text-muted-foreground">
                                {header} · 规格字段
                              </span>
                            </span>
                            <Settings2 className="ml-auto size-3.5 opacity-40" />
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {variants.data?.rows.map((variant) => (
                      <tr key={variant.id}>
                        <td className="max-w-64 truncate p-3">
                          {String(
                            variant.product.data.title ||
                              variant.product.sourceId ||
                              variant.product.id,
                          )}
                        </td>
                        <td className="p-2">
                          {variantImageUrl(variant) ? (
                            <img src={variantImageUrl(variant)} alt="规格商品图片" className="size-14 rounded-md border bg-white object-contain" />
                          ) : <span className="text-xs text-muted-foreground">暂无图片</span>}
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {variant.sourceId || variant.id}
                        </td>
                        {(variants.data?.headers || []).map((header) => (
                          <td key={header} className="max-w-56 truncate p-3">
                            {typeof variant.data[header] === "object"
                              ? JSON.stringify(variant.data[header])
                              : String(variant.data[header] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(variants.isLoading || autoLoadingVariants) && (
                  <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在自动加载商品规格与图片…</div>
                )}
                {!variants.isLoading && !autoLoadingVariants && !variants.data?.rows.length && (
                  <p className="p-10 text-center text-sm text-muted-foreground">
                    当前批次没有可用的规格数据。
                  </p>
                )}
              </div>
            </CardContent>
          )}
          {tableMode === "products" && (
            <CardContent>
              <div className="relative h-[560px] overflow-auto rounded-lg border">
                <table className="min-w-max border-separate border-spacing-0 text-sm">
                  <thead className="sticky top-0 z-20 bg-muted text-muted-foreground shadow-sm">
                    <tr>
                      <th className="sticky left-0 z-30 w-16 border-b border-r bg-muted p-3 text-center">
                        #
                      </th>
                      {visibleHeaders.map((header, index) => (
                        <th
                          key={header}
                          className="min-w-48 resize-x overflow-hidden border-b border-r p-3 text-left"
                        >
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 text-left hover:text-primary"
                            onClick={() => {
                              const existing = fieldRows.find(
                                (field) => field.key === header,
                              );
                              if (existing) editField(existing);
                              else {
                                form.reset({
                                  ...fieldDefaults,
                                  key: header,
                                  label: header,
                                  position: index,
                                });
                                setFieldPanelOpen(true);
                              }
                            }}
                            title="编辑字段类型、规则和 AI 能力"
                          >
                            <span className="min-w-0">
                              <span className="block truncate">
                                {fieldRows.find(
                                  (field) => field.key === header,
                                )?.label ||
                                  PRODUCT_FIELD_META[header]?.label ||
                                  header}
                              </span>
                              <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground">
                                {header} ·{" "}
                                {PRODUCT_FIELD_META[header]?.description ||
                                  "独立站扩展商品字段"}
                              </span>
                            </span>
                            {index < 2 && <Badge variant="outline">冻结</Badge>}
                            {fieldRows.find((field) => field.key === header)
                              ?.rule?.kind === "AI" && (
                              <Sparkles className="size-3.5 text-violet-500" />
                            )}
                            <Settings2 className="ml-auto size-3.5 opacity-40" />
                          </button>
                        </th>
                      ))}
                      <th className="min-w-36 border-b p-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => newField(headers.length)}
                        >
                          <Plus className="size-3.5" />
                          添加字段
                        </Button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.data?.items.map((product) => (
                      <tr
                        id={`product-${product.id}`}
                        key={product.id}
                        className="group scroll-mt-40 hover:bg-muted/30 target:bg-primary/10"
                      >
                        <td className="sticky left-0 z-10 border-b border-r bg-card p-3 text-center text-muted-foreground group-hover:bg-muted">
                          {product.rowIndex + 1}
                        </td>
                        {visibleHeaders.map((header) => (
                          <td key={header} className="border-b border-r p-0">
                            <StructuredCell
                              value={product.data[header]}
                              productId={product.id}
                              onSave={(value) =>
                                void saveCell(product, header, value)
                              }
                            />
                          </td>
                        ))}
                        <td className="border-b border-r bg-muted/20 p-2 text-center text-xs text-muted-foreground">
                          —
                        </td>
                      </tr>
                    ))}
                    {!products.data?.items.length && (
                      <tr>
                        <td
                          colSpan={visibleHeaders.length + 2}
                          className="h-80 text-center text-muted-foreground"
                        >
                          <div className="flex flex-col items-center gap-3">
                            <p>
                              {batchId
                                ? "当前批次没有商品"
                                : "还没有商品数据，请先选择一种方式开始。"}
                            </p>
                            {!batchId && (
                              <div className="flex flex-wrap justify-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => fileRef.current?.click()}
                                >
                                  <Upload className="size-3.5" />
                                  导入 XLSX / CSV
                                </Button>
                                <Button
                                  size="sm"
                                  disabled={!siteId || fecifyImport.isPending}
                                  onClick={() => fecifyImport.mutate()}
                                >
                                  {fecifyImport.isPending ? (
                                    <LoaderCircle className="size-3.5 animate-spin" />
                                  ) : (
                                    <DownloadCloud className="size-3.5" />
                                  )}
                                  拉取独立站商品
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                    {batchId && (
                      <tr>
                        <td
                          colSpan={headers.length + 3}
                          className="border-b bg-muted/20 p-2"
                        >
                          <Button size="sm" variant="outline" onClick={addRow}>
                            <Plus className="size-3.5" />
                            新增记录
                          </Button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">
                    共 {products.data?.total || 0} 条 · {headers.length} 个字段
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    上一页
                  </Button>
                  <Badge variant="outline">第 {page} 页</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      !products.data ||
                      page * products.data.pageSize >= products.data.total
                    }
                    onClick={() => setPage((value) => value + 1)}
                  >
                    下一页
                  </Button>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
        {fieldPanelOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setFieldPanelOpen(false)}
          />
        )}
        {fieldPanelOpen && (
          <Card className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-auto rounded-none border-y-0 border-r-0 shadow-2xl">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {form.watch("id") ? "编辑字段" : "新增字段"}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFieldPanelOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <CardDescription>
                飞书多维表格式字段定义，规则保存后供填充和 Worker 直接执行。
              </CardDescription>
            </CardHeader>
            <CardContent>
              <details className="mb-4 rounded-lg border bg-muted/30 p-3">
                <summary className="cursor-pointer list-none text-sm font-medium">
                  选择已有字段
                </summary>
                <div className="mt-3 flex max-h-40 flex-wrap gap-2 overflow-auto">
                  {Array.from(
                    new Set([
                      ...DEFAULT_PRODUCT_FIELDS,
                      ...fieldRows.map((field) => field.key),
                    ]),
                  ).map((key) => (
                    <Button
                      key={key}
                      size="sm"
                      variant="outline"
                      onClick={() => openDefaultField(key)}
                    >
                      {fieldRows.find((field) => field.key === key)?.label ||
                        PRODUCT_FIELD_META[key]?.label ||
                        key}
                    </Button>
                  ))}
                </div>
              </details>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((data) =>
                  saveField.mutate({
                    ...data,
                    rule: executionRuleKind ? data.rule : undefined,
                  }),
                )}
              >
                <Field label="字段名称">
                  <Input {...form.register("label")} placeholder="SEO 标题" />
                </Field>
                <Field label="字段键">
                  <Input {...form.register("key")} placeholder="seo_title" />
                </Field>
                <Field label="字段类型">
                  <select
                    value={form.watch("type")}
                    onChange={(event) => {
                      const type = event.target
                        .value as FieldDefinitionInput["type"];
                      form.setValue("type", type);
                      if (type === "AI") {
                        form.setValue("rule", { kind: "AI", config: {} });
                        setExecutionRuleKind("AI");
                      }
                      if (type === "FORMULA") {
                        form.setValue("rule", { kind: "FORMULA", config: {} });
                        setExecutionRuleKind("FORMULA");
                      }
                      if (type === "REFERENCE") {
                        form.setValue("rule", {
                          kind: "REFERENCE",
                          config: {},
                        });
                        setExecutionRuleKind("REFERENCE");
                      }
                    }}
                    className="control"
                  >
                    {[
                      ["TEXT", "单行文本"],
                      ["MULTILINE", "多行文本"],
                      ["NUMBER", "数字"],
                      ["BOOLEAN", "复选框"],
                      ["DATE", "日期"],
                      ["URL", "URL"],
                      ["IMAGE", "图片"],
                      ["HTML", "HTML"],
                      ["JSON", "JSON"],
                      ["AI", "AI 自动填充"],
                      ["TRANSLATION", "翻译"],
                      ["FORMULA", "公式"],
                      ["REFERENCE", "查找引用"],
                    ].map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="默认值">
                  <Input
                    value={String(form.watch("defaultValue") ?? "")}
                    onChange={(e) =>
                      form.setValue("defaultValue", e.target.value)
                    }
                  />
                </Field>
                <Field label="执行规则">
                  <select
                    className="control"
                    value={executionRuleKind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      setExecutionRuleKind(kind);
                      if (!kind) form.unregister("rule");
                      else
                        form.setValue(
                          "rule",
                          {
                            kind,
                            config:
                              kind === "AI" && defaultAiModel
                                ? { modelConnectionId: defaultAiModel }
                                : {},
                          },
                          {
                            shouldDirty: true,
                            shouldValidate: true,
                          },
                        );
                      if (kind === "AI" && form.getValues("id")) {
                        autoSavingField.current = true;
                        setTimeout(() => saveField.mutate(form.getValues()), 0);
                      }
                    }}
                  >
                    <option value="">不自动执行</option>
                    <option value="COPY">复制其他字段</option>
                    <option value="TEMPLATE">模板拼接</option>
                    <option value="AI">AI 自动生成</option>
                    <option value="FORMULA">公式计算</option>
                    <option value="REFERENCE">查找引用</option>
                  </select>
                </Field>
                {(executionRuleKind === "COPY" ||
                  executionRuleKind === "REFERENCE") && (
                  <Field label="来源字段键">
                    <Input
                      value={String(
                        form.watch("rule.config.sourceField") || "",
                      )}
                      onChange={(event) =>
                        form.setValue(
                          "rule.config.sourceField",
                          event.target.value,
                        )
                      }
                      placeholder="title"
                    />
                  </Field>
                )}
                {executionRuleKind === "FORMULA" && (
                  <Field label="公式（使用 {{字段键}}）">
                    <Input
                      value={String(form.watch("rule.config.formula") || "")}
                      onChange={(event) =>
                        form.setValue("rule.config.formula", event.target.value)
                      }
                      placeholder="{{price}} * 1.2 或 {{title}} - {{sku}}"
                    />
                  </Field>
                )}
                {executionRuleKind === "TEMPLATE" && (
                  <Field label="模板（使用 {{字段键}}）">
                    <Input
                      value={String(form.watch("rule.config.template") || "")}
                      onChange={(event) =>
                        form.setValue(
                          "rule.config.template",
                          event.target.value,
                        )
                      }
                      placeholder="{{title}} - {{sku}}"
                    />
                  </Field>
                )}
                {executionRuleKind === "AI" && (
                  <>
                    <Field label="AI 文本模型">
                      <select
                        className="control"
                        value={String(
                          form.watch("rule.config.modelConnectionId") ||
                            defaultAiModel,
                        )}
                        onChange={(event) => {
                          form.setValue(
                            "rule.config.modelConnectionId",
                            event.target.value,
                            { shouldDirty: true },
                          );
                          localStorage.setItem(
                            "field-ai-model",
                            event.target.value,
                          );
                          setDefaultAiModel(event.target.value);
                          if (form.getValues("id")) {
                            autoSavingField.current = true;
                            setTimeout(
                              () => saveField.mutate(form.getValues()),
                              0,
                            );
                          }
                        }}
                      >
                        <option value="">请选择文本模型</option>
                        {textModels.data?.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name} · {model.model}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="AI 提示词（支持 {{字段键}}）">
                      <Input
                        value={String(form.watch("rule.config.prompt") || "")}
                        onChange={(event) => {
                          form.setValue(
                            "rule.config.prompt",
                            event.target.value,
                            { shouldDirty: true },
                          );
                          localStorage.setItem(
                            "field-ai-prompt",
                            event.target.value,
                          );
                        }}
                        onBlur={() => {
                          if (form.getValues("id")) {
                            autoSavingField.current = true;
                            saveField.mutate(form.getValues());
                          }
                        }}
                        placeholder="请为 {{title}} 生成 SEO 标题"
                      />
                    </Field>
                    <div className="flex max-h-28 flex-wrap gap-1 overflow-auto rounded-lg border p-2">
                      {headers.map((header) => (
                        <Button
                          key={header}
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const current = String(
                              form.getValues("rule.config.prompt") || "",
                            );
                            form.setValue(
                              "rule.config.prompt",
                              `${current}${current ? " " : ""}{{${header}}}`,
                              { shouldDirty: true },
                            );
                          }}
                        >
                          {PRODUCT_FIELD_META[header]?.label || header}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          form.setValue(
                            "rule.config.prompt",
                            localStorage.getItem("field-ai-prompt") || "",
                            { shouldDirty: true },
                          )
                        }
                      >
                        复用上次提示词
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      模型选择会记住，之后编辑其他 AI 字段时默认沿用。
                    </p>
                  </>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...form.register("frozen")} />
                    冻结字段
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" {...form.register("hidden")} />
                    隐藏字段
                  </label>
                </div>
                {form.formState.errors.key && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.key.message}
                  </p>
                )}
                <Button className="w-full" disabled={saveField.isPending}>
                  <Save className="size-4" />
                  {saveField.isPending ? "保存中…" : "保存字段定义"}
                </Button>
                <Field label="任务执行范围">
                  <select
                    className="control"
                    value={fieldScope}
                    onChange={(event) =>
                      setFieldScope(
                        event.target.value as "page" | "range" | "all",
                      )
                    }
                  >
                    <option value="page">
                      当前页（{products.data?.items.length || 0} 条）
                    </option>
                    <option value="all">
                      整个批次（{products.data?.total || 0} 条）
                    </option>
                    <option value="range">自定义编号范围</option>
                  </select>
                </Field>
                {fieldScope === "range" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="起始编号">
                      <Input
                        type="number"
                        min={1}
                        value={rangeStart}
                        onChange={(event) =>
                          setRangeStart(Number(event.target.value))
                        }
                      />
                    </Field>
                    <Field label="结束编号">
                      <Input
                        type="number"
                        min={rangeStart}
                        value={rangeEnd}
                        onChange={(event) =>
                          setRangeEnd(Number(event.target.value))
                        }
                      />
                    </Field>
                  </div>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={
                    !batchId ||
                    !form.watch("id") ||
                    !executionRuleKind ||
                    runField.isPending
                  }
                  onClick={() => runField.mutate()}
                >
                  {runField.isPending ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <DownloadCloud className="size-4" />
                  )}
                  提交后台字段任务
                </Button>
                {runField.data && (
                  <div className="space-y-2 rounded-lg border p-3 text-sm">
                    <div className="flex justify-between">
                      <span>
                        字段任务 · {fieldJob.data?.status || "等待执行"}
                      </span>
                      <span>
                        {fieldJob.data?.completedItems || 0}/
                        {fieldJob.data?.totalItems || runField.data.totalItems}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.round(((fieldJob.data?.completedItems || 0) / Math.max(1, fieldJob.data?.totalItems || runField.data.totalItems)) * 100)}%`,
                        }}
                      />
                    </div>
                    {fieldJob.data?.status === "COMPLETED" && (
                      <p className="text-emerald-600">
                        已生成 {fieldJob.data.result?.processed || 0} 条{" "}
                        {fieldJob.data.result?.fieldKey || "字段"}{" "}
                        结果，商品数据表已刷新。
                      </p>
                    )}
                    {fieldJob.data?.status === "FAILED" && (
                      <p className="text-destructive">
                        {fieldJob.data.events[0]?.message || "字段任务执行失败"}
                      </p>
                    )}
                  </div>
                )}
                {runField.error && (
                  <p className="text-sm text-destructive">
                    {runField.error.message}
                  </p>
                )}
                {saveField.error && (
                  <p className="text-sm text-destructive">
                    {saveField.error.message}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        )}
        {historyProduct && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setHistoryProduct(undefined)}
            />
            <Card className="fixed inset-y-0 right-0 z-50 w-full max-w-lg overflow-auto rounded-none border-y-0 border-r-0 shadow-2xl">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>修改历史</CardTitle>
                    <CardDescription>
                      第 {historyProduct.rowIndex + 1} 行 · 最近 50 条修改
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setHistoryProduct(undefined)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {changes.map((change) => (
                  <div key={change.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {change.field || change.action}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(change.createdAt).toLocaleString()} ·{" "}
                          {change.action}
                        </p>
                      </div>
                      {change.action !== "UNDO" && !change.undoneAt && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void undoChange(change.id)}
                        >
                          <RotateCcw className="size-3.5" />
                          撤销
                        </Button>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded bg-muted p-2">
                        <span className="text-muted-foreground">修改前</span>
                        <p className="mt-1 break-all">
                          {displayValue(change.before)}
                        </p>
                      </div>
                      <div className="rounded bg-muted p-2">
                        <span className="text-muted-foreground">修改后</span>
                        <p className="mt-1 break-all">
                          {displayValue(change.after)}
                        </p>
                      </div>
                    </div>
                    {change.undoneAt && (
                      <Badge variant="outline" className="mt-2">
                        已撤销
                      </Badge>
                    )}
                  </div>
                ))}
                {!changes.length && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    暂无修改记录
                  </p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
      {quickSettingsOpen && (
        <button
          aria-label="关闭字段快速设置"
          className="fixed inset-0 z-40 bg-black/40"
          onClick={() => setQuickSettingsOpen(false)}
        />
      )}
      {quickSettingsOpen && (
        <Card className="fixed inset-y-6 right-6 z-50 w-[min(620px,calc(100vw-3rem))] overflow-auto shadow-2xl">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>字段快速设置</CardTitle>
                <CardDescription className="mt-2">
                  勾选一个或多个字段，统一设置字段类型和执行规则；仍可进入单个字段做详细配置。
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                onClick={() => setQuickSettingsOpen(false)}
              >
                关闭
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="批量字段类型"><select className="control" value={quickType} onChange={(event) => setQuickType(event.target.value as FieldDefinitionInput['type'])}>{["TEXT","MULTILINE","NUMBER","BOOLEAN","DATE","URL","IMAGE","HTML","JSON","AI","TRANSLATION","FORMULA","REFERENCE"].map((type) => <option key={type} value={type}>{type}</option>)}</select></Field>
                <Field label="批量执行规则"><select className="control" value={quickRuleKind} onChange={(event) => setQuickRuleKind(event.target.value)}><option value="NONE">无自动规则</option><option value="AI">AI 生成</option><option value="COPY">复制字段</option><option value="REFERENCE">引用字段</option><option value="TEMPLATE">模板</option><option value="FORMULA">公式</option></select></Field>
              </div>
              {quickRuleKind !== "NONE" && <Field label={quickRuleKind === "AI" ? "AI 提示词" : quickRuleKind === "TEMPLATE" ? "模板内容" : quickRuleKind === "FORMULA" ? "计算公式" : "来源字段键"}><textarea className="min-h-24 w-full rounded-lg border bg-background px-3 py-2 text-sm" value={quickRuleValue} onChange={(event) => setQuickRuleValue(event.target.value)} /></Field>}
              <div className="flex flex-wrap items-center gap-3"><Button type="button" onClick={() => bulkSaveFields.mutate()} disabled={!quickSelected.length || bulkSaveFields.isPending}><Save className="size-4" />{bulkSaveFields.isPending ? "批量保存中…" : `应用到 ${quickSelected.length} 个字段`}</Button>{bulkSaveFields.isSuccess && <span className="text-sm text-emerald-600">批量设置已保存</span>}{bulkSaveFields.error && <span className="text-sm text-destructive">{bulkSaveFields.error.message}</span>}</div>
            </div>
            <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-medium"><input type="checkbox" checked={Boolean(fieldRows.length) && quickSelected.length === fieldRows.length} onChange={(event) => setQuickSelected(event.target.checked ? fieldRows.map((field) => field.id) : [])} />全选全部字段</label>
            {(fields.data || []).map((field) => (
              <div key={field.id} className="flex w-full items-center gap-3 rounded-lg border p-3">
                <input type="checkbox" className="size-4" checked={quickSelected.includes(field.id)} onChange={(event) => setQuickSelected((current) => event.target.checked ? [...new Set([...current, field.id])] : current.filter((id) => id !== field.id))} />
                <span className="min-w-0 flex-1"><strong className="block text-sm">{field.label}</strong><span className="text-xs text-muted-foreground">{field.key} · {field.type}</span></span>
                <Badge variant={field.rule?.kind === "AI" ? "default" : "outline"}>{field.rule?.kind === "AI" ? "AI 提示词" : field.rule?.kind || "无自动规则"}</Badge>
                <Button type="button" size="sm" variant="ghost" onClick={() => { editField(field); setQuickSettingsOpen(false); }}>单独编辑</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
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

function StructuredCell({
  value,
  productId,
  onSave,
}: {
  value: unknown;
  productId?: string;
  onSave: (value: string) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [imageStart, setImageStart] = useState(0);
  if (Array.isArray(value)) {
    const urls = value
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? String(
                (item as Record<string, unknown>).url ||
                  (item as Record<string, unknown>).src ||
                  (item as Record<string, unknown>).image_url ||
                  "",
              )
            : "",
      )
      .filter((item) => /^https?:\/\//i.test(item));
    return (
      <details className="group min-w-48 px-3 py-1.5">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 overflow-hidden">
          {urls.slice(0, 3).map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="size-8 rounded border object-cover"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setPreviewUrl(url);
              }}
            />
          ))}
          {!urls.length &&
            value.slice(0, 3).map((item, index) => (
              <Badge
                key={index}
                variant="outline"
                className="max-w-24 truncate"
              >
                {typeof item === "object" ? "对象" : String(item)}
              </Badge>
            ))}
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {value.length} 项
          </span>
        </summary>
        {urls.length ? (
          <div className="mt-2 flex w-[22rem] max-w-[calc(100vw-5rem)] items-center gap-2 rounded bg-muted p-2">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              disabled={urls.length <= 3}
              onClick={() =>
                setImageStart(
                  (current) => (current - 3 + urls.length) % urls.length,
                )
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              {Array.from({ length: Math.min(3, urls.length) }, (_, offset) => {
                const index = (imageStart + offset) % urls.length;
                const url = urls[index];
                return (
                  <button
                    type="button"
                    key={`${url}-${index}`}
                    onClick={() => setPreviewUrl(url)}
                    className="relative min-w-0"
                  >
                    <img
                      src={url}
                      alt={`商品图片 ${index + 1}`}
                      className="h-24 w-full rounded border bg-card object-contain"
                    />
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      {index + 1}
                    </span>
                    <span
                      role="link"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        const params = new URLSearchParams({
                          sourceMode: "store",
                          imageUrl: url,
                        });
                        if (productId) params.set("productId", productId);
                        window.location.href = `/images?${params}`;
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        const params = new URLSearchParams({
                          sourceMode: "store",
                          imageUrl: url,
                        });
                        if (productId) params.set("productId", productId);
                        window.location.href = `/images?${params}`;
                      }}
                      className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground shadow"
                      title="优化图片"
                    >
                      优化图片
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="size-8 shrink-0"
              disabled={urls.length <= 3}
              onClick={() =>
                setImageStart((current) => (current + 3) % urls.length)
              }
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : (
          <pre className="mt-2 max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
            {JSON.stringify(value, null, 2)}
          </pre>
        )}
        {previewUrl && (
          <div
            className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-6"
            onClick={() => setPreviewUrl(undefined)}
          >
            <button
              type="button"
              className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white"
            >
              <X className="size-6" />
            </button>
            <img
              src={previewUrl}
              alt="商品图片大图"
              className="max-h-full max-w-full rounded-xl object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>
        )}
      </details>
    );
  }
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    const keys = Object.keys(object);
    return (
      <details className="group min-w-48 px-3 py-1.5">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2">
          <Badge variant="outline">JSON</Badge>
          <span className="max-w-32 truncate text-xs text-muted-foreground">
            {keys.slice(0, 3).join(", ") || "空对象"}
          </span>
        </summary>
        <pre className="mt-2 max-h-64 max-w-xl overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      </details>
    );
  }
  return (
    <input
      defaultValue={value == null ? "" : String(value)}
      onBlur={(event) => onSave(event.target.value)}
      className="h-11 w-full min-w-48 bg-transparent px-3 outline-none focus:bg-accent/40 focus:ring-2 focus:ring-inset focus:ring-ring"
    />
  );
}

function displayValue(value: unknown) {
  if (value == null) return "空";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
