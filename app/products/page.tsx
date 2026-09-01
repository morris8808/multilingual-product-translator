"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Languages,
  ListTree,
  LoaderCircle,
  Play,
  RefreshCw,
  Save,
  Send,
  Maximize2,
  Minimize2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { PageHeading } from "@/components/page-heading";
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
import { PRODUCT_FIELD_META } from "@/lib/product-fields";
import { languageLabel } from "@/lib/languages";
import {
  translationJobInputSchema,
  type TranslationJobInput,
} from "@/lib/schemas/translation";
type Batch = {
  id: string;
  name: string;
  headers: unknown;
  source: string;
  fieldMappings?: unknown;
  _count: { products: number };
};
type Product = { id: string; rowIndex: number; data: Record<string, unknown> };
type Model = {
  id: string;
  name: string;
  model: string;
  kind: string;
  enabled: boolean;
};
type Site = {
  id: string;
  name: string;
  platform: string;
  baseLanguage: string | null;
  enabledLanguages: unknown;
};
const COMMON_LANGUAGES = [
  "en",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "de",
  "fr",
  "es",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "ar",
  "tr",
  "th",
  "vi",
  "id",
];
const CANONICAL_PRODUCT_FIELDS = [
  "id",
  "handle",
  "spu",
  "sku",
  "title",
  "sub_title",
  "body_html",
  "vendor",
  "product_type",
  "tags",
  "status",
  "price",
  "compare_at_price",
  "cost",
  "barcode",
  "weight",
  "weight_unit",
  "inventory_quantity",
  "inventory_policy",
  "requires_shipping",
  "taxable",
  "option1_name",
  "option1_value",
  "option2_name",
  "option2_value",
  "option3_name",
  "option3_value",
  "image_src",
  "image_alt",
  "seo_title",
  "meta_title",
  "meta_keywords",
  "meta_description",
  "collection_ids",
];
const PRODUCT_FIELD_LABELS: Record<string, string> = {
  id: "商品 ID",
  handle: "商品链接标识",
  spu: "标准商品编码",
  sku: "库存单位编码",
  title: "商品标题",
  sub_title: "商品副标题",
  body_html: "商品详情",
  vendor: "品牌/供应商",
  product_type: "商品类型",
  tags: "标签",
  status: "上架状态",
  price: "销售价",
  compare_at_price: "划线价",
  cost: "成本价",
  barcode: "条形码",
  weight: "重量",
  weight_unit: "重量单位",
  inventory_quantity: "库存数量",
  inventory_policy: "库存策略",
  requires_shipping: "需要配送",
  taxable: "是否计税",
  option1_name: "规格一名称",
  option1_value: "规格一值",
  option2_name: "规格二名称",
  option2_value: "规格二值",
  option3_name: "规格三名称",
  option3_value: "规格三值",
  image_src: "商品图片",
  image_alt: "图片说明",
  seo_title: "SEO 标题",
  meta_title: "Meta 标题",
  meta_keywords: "Meta 关键词",
  meta_description: "Meta 描述",
  collection_ids: "商品专辑",
};
const REQUIRED_PRODUCT_FIELDS = new Set(["handle", "title", "status"]);
const FIELD_ALIASES: Record<string, string[]> = {
  title: ["name", "productname", "商品名称", "标题"],
  body_html: ["description", "detail", "商品描述", "详情"],
  sku: ["productsku", "货号", "商家编码"],
  spu: ["productid", "spuid", "商品id"],
  price: ["saleprice", "售价", "销售价"],
  compare_at_price: ["originalprice", "marketprice", "原价", "市场价"],
  image_src: ["image", "images", "mainimage", "图片", "主图"],
  vendor: ["brand", "品牌"],
  product_type: ["category", "type", "分类", "类目"],
  tags: ["tag", "标签"],
  meta_description: ["seodescription", "seo_description"],
};
const normalizeField = (value: string) =>
  value.toLowerCase().replace(/[\s_-]/g, "");
type TranslationItem = {
  id: string;
  field: string;
  sourceText: string;
  status: string;
  translations: Record<string, string> | null;
};
type TranslationRun = {
  id: string;
  targetLanguages: unknown;
  items: TranslationItem[];
  job: {
    id: string;
    status: string;
    completedItems: number;
    totalItems: number;
    createdAt: string;
    events: Array<{
      id: string;
      message: string;
      level?: string;
      createdAt?: string;
    }>;
  };
};
export default function ProductsPage() {
  const client = useQueryClient();
  const [batchId, setBatchId] = useState("");
  const [productPage, setProductPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [sourceFullscreen, setSourceFullscreen] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const selectionBatchRef = useRef("");
  const batches = useQuery({
    queryKey: ["import-batches"],
    queryFn: async () => {
      const r = await fetch("/api/import-batches");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "商品批次读取失败");
      return data as Batch[];
    },
  });
  const batchRows = Array.isArray(batches.data) ? batches.data : [];
  useEffect(() => {
    if (!batchId && batchRows[0]) setBatchId(batchRows[0].id);
  }, [batchId, batchRows]);
  const products = useQuery({
    queryKey: ["translation-products", batchId, productPage],
    enabled: Boolean(batchId),
    queryFn: async () => {
      const r = await fetch(
        `/api/import-batches/${batchId}/products?page=${productPage}&pageSize=20`,
      );
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "商品读取失败");
      return data as {
        items: Product[];
        headers: unknown;
        total: number;
        page: number;
        pageSize: number;
      };
    },
  });
  const models = useQuery({
    queryKey: ["model-connections"],
    queryFn: async () => {
      const r = await fetch("/api/connections/models");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "模型连接读取失败");
      return data as Model[];
    },
  });
  const modelRows = Array.isArray(models.data) ? models.data : [];
  const sites = useQuery({
    queryKey: ["site-connections"],
    queryFn: async () => {
      const r = await fetch("/api/connections/sites");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "独立站连接读取失败");
      return data as Site[];
    },
  });
  const siteRows = Array.isArray(sites.data) ? sites.data : [];
  const selectedBatch = batchRows.find((batch) => batch.id === batchId);
  const deleteBatch = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error("请先选择要删除的商品批次");
      const confirmed = window.confirm(
        `确定将“${selectedBatch?.name || "当前商品批次"}”移到回收站吗？之后可以恢复或彻底删除。`,
      );
      if (!confirmed) return { cancelled: true };
      const response = await fetch(`/api/import-batches/${batchId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "商品批次删除失败");
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      const nextBatch = batchRows.find((batch) => batch.id !== batchId);
      setBatchId(nextBatch?.id || "");
      setSelectedProducts([]);
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({ queryKey: ["translation-products"] });
      void client.invalidateQueries({ queryKey: ["images"] });
    },
  });
  const selectedBatchSiteId = selectedBatch?.source.startsWith("FECIFY:")
    ? selectedBatch.source.slice(7)
    : "";
  const selectedBatchSite =
    siteRows.find((site) => site.id === selectedBatchSiteId) ||
    siteRows.find((site) => ["fecify", "jofshop"].includes(site.platform.toLowerCase()));
  const isSiteBatch = Boolean(selectedBatchSiteId);
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: async () =>
      (await fetch("/api/settings")).json() as Promise<{
        preferences?: { showLanguageLabels?: boolean };
      }>,
  });
  const runs = useQuery({
    queryKey: ["translation-jobs"],
    queryFn: async () => {
      const r = await fetch("/api/translation-jobs");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "翻译任务读取失败");
      return data as TranslationRun[];
    },
    refetchInterval: 3000,
  });
  const runRows = Array.isArray(runs.data) ? runs.data : [];
  const deleteRun = useMutation({
    mutationFn: async (jobId: string) => {
      if (!window.confirm("确定删除这个翻译任务及其翻译结果吗？")) {
        return { cancelled: true };
      }
      const response = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "翻译任务删除失败");
      return { cancelled: false };
    },
    onSuccess: (result) => {
      if (result.cancelled) return;
      void client.invalidateQueries({ queryKey: ["translation-jobs"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const headers = Array.isArray(products.data?.headers)
    ? products.data.headers.map(String)
    : [];
  const form = useForm<TranslationJobInput>({
    resolver: zodResolver(translationJobInputSchema),
    defaultValues: {
      batchId: "",
      modelConnectionId: "",
      sourceLanguage: "auto",
      targetLanguages: ["en"],
      fields: [],
      productIds: [],
    },
  });
  useEffect(() => {
    form.setValue("batchId", batchId);
    setProductPage(1);
    setSelectedProducts([]);
    selectionBatchRef.current = "";
  }, [batchId, form]);
  useEffect(() => {
    if (!products.data || selectionBatchRef.current === batchId) return;
    setSelectedProducts(products.data.items.map((item) => item.id));
    selectionBatchRef.current = batchId;
  }, [batchId, products.data]);
  useEffect(() => {
    const first = modelRows.find(
      (item) => item.kind === "TEXT" && item.enabled,
    );
    if (first && !form.getValues("modelConnectionId"))
      form.setValue("modelConnectionId", first.id);
  }, [modelRows, form]);
  useEffect(() => {
    const enabled = Array.isArray(selectedBatchSite?.enabledLanguages)
      ? selectedBatchSite.enabledLanguages
          .map(String)
          .filter((code) => code !== selectedBatchSite?.baseLanguage)
      : [];
    if (enabled.length) form.setValue("targetLanguages", enabled);
  }, [selectedBatchSite?.enabledLanguages, selectedBatchSite?.baseLanguage, form]);
  useEffect(() => {
    if (isSiteBatch && selectedBatchSite?.baseLanguage) {
      form.setValue("sourceLanguage", selectedBatchSite.baseLanguage);
    } else {
      form.setValue("sourceLanguage", "auto");
    }
  }, [form, isSiteBatch, selectedBatchSite?.baseLanguage]);
  const selectedFields = form.watch("fields");
  const saveMappings = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/import-batches/${batchId}/field-mappings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: Object.fromEntries(
            Object.entries(mappings).filter(([, target]) => target),
          ),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "字段映射失败");
      return data;
    },
    onSuccess: () => {
      setMappingOpen(false);
      void client.invalidateQueries({ queryKey: ["import-batches"] });
      void client.invalidateQueries({
        queryKey: ["translation-products", batchId],
      });
    },
  });
  const openMappings = () => {
    const saved = selectedBatch?.fieldMappings;
    const initial =
      saved && typeof saved === "object" && !Array.isArray(saved)
        ? (saved as Record<string, string>)
        : Object.fromEntries(
            headers.map((source) => {
              const normalized = normalizeField(source);
              const direct = CANONICAL_PRODUCT_FIELDS.find(
                (target) => normalizeField(target) === normalized,
              );
              const alias = Object.entries(FIELD_ALIASES).find(([, values]) =>
                values.some((value) => normalizeField(value) === normalized),
              )?.[0];
              return [source, direct || alias || ""];
            }),
          );
    setMappings(initial);
    setMappingOpen(true);
  };
  const create = useMutation({
    mutationFn: async (input: TranslationJobInput) => {
      const r = await fetch("/api/translation-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          batchId,
          productIds: selectedProducts,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "任务创建失败");
      return data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["translation-jobs"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
  const toggleField = (field: string) =>
    form.setValue(
      "fields",
      selectedFields.includes(field)
        ? selectedFields.filter((item) => item !== field)
        : [...selectedFields, field],
      { shouldValidate: true },
    );
  const preview = useMemo(
    () => products.data?.items || [],
    [products.data],
  );
  const productPages = Math.max(
    1,
    Math.ceil((products.data?.total || 0) / (products.data?.pageSize || 20)),
  );
  const selectAllProducts = useMutation({
    mutationFn: async () => {
      if (!batchId) throw new Error("请先选择商品批次");
      const response = await fetch(
        `/api/import-batches/${batchId}/products?idsOnly=1`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "商品选择失败");
      return data as { ids: string[] };
    },
    onSuccess: (data) => setSelectedProducts(data.ids),
  });
  return (
    <main className="space-y-6 p-5 lg:p-8">
      <PageHeading
        eyebrow="翻译工作流"
        title="商品翻译"
        description="选择商品、字段、语言与服务端模型后创建后台任务；术语规则由 Worker 自动应用。"
      />
      <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>创建翻译任务</CardTitle>
            <CardDescription>
              凭证不会进入浏览器；页面关闭后任务继续执行。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((data) => create.mutate(data))}
            >
              <Field label="商品批次">
                <div className="flex gap-2">
                  <select
                    className="control min-w-0 flex-1"
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                  >
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
                    className="shrink-0"
                    disabled={!batchId || deleteBatch.isPending}
                    onClick={() => deleteBatch.mutate()}
                    title="将当前商品批次移到回收站"
                    aria-label="将当前商品批次移到回收站"
                  >
                    {deleteBatch.isPending ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4" />
                    )}
                  </Button>
                </div>
              </Field>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={openMappings}
                disabled={!batchId}
              >
                <ListTree className="size-4" />
                字段映射
              </Button>
              {deleteBatch.error && (
                <p className="text-sm text-destructive">
                  {deleteBatch.error.message}
                </p>
              )}
              {!isSiteBatch && (
                <p className="text-xs text-amber-600">
                  当前为外部文件批次，建议先映射到独立站标准商品字段。
                </p>
              )}
              <Field label="文本模型">
                <select
                  className="control"
                  {...form.register("modelConnectionId")}
                >
                  <option value="">选择模型连接</option>
                  {modelRows
                    .filter((item) => item.kind === "TEXT" && item.enabled)
                    .map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} · {model.model}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="源语言">
                <Input
                  {...form.register("sourceLanguage")}
                  placeholder="auto"
                  readOnly={isSiteBatch}
                />
                {isSiteBatch && (
                  <p className="text-xs text-muted-foreground">
                    已根据当前独立站语言自动设置。
                  </p>
                )}
              </Field>
              <Field label="目标语言">
                <LanguagePicker
                  value={form.watch("targetLanguages")}
                  baseLanguage={
                    selectedBatchSite?.baseLanguage || ""
                  }
                  siteLanguages={
                    selectedBatchSite?.enabledLanguages
                  }
                  showSiteWords={isSiteBatch}
                  onChange={(value) =>
                    form.setValue("targetLanguages", value, {
                      shouldValidate: true,
                    })
                  }
                  showLabels={
                    settings.data?.preferences?.showLanguageLabels ?? true
                  }
                />
              </Field>
              <div className="space-y-2">
                <Label>翻译字段</Label>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-auto rounded-lg border p-3">
                  {headers.map((field) => (
                    <Button
                      key={field}
                      type="button"
                      size="sm"
                      variant={
                        selectedFields.includes(field) ? "default" : "outline"
                      }
                      onClick={() => toggleField(field)}
                    >
                      <span className="text-left">
                        <span className="block">
                          {PRODUCT_FIELD_META[field]?.label ||
                            PRODUCT_FIELD_LABELS[field] ||
                            field}
                        </span>
                        <span className="block text-[10px] opacity-70">
                          {field}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
              <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                已选 {selectedProducts.length} 个商品 · {selectedFields.length}{" "}
                个字段 · {form.watch("targetLanguages").length} 种语言
              </div>
              <Button
                className="w-full"
                disabled={create.isPending || !selectedProducts.length}
              >
                {create.isPending ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                提交后台翻译
              </Button>
              {create.error && (
                <p className="text-sm text-destructive">
                  {create.error.message}
                </p>
              )}
              {create.data && (
                <p className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle2 className="size-4" />
                  任务已创建
                </p>
              )}
            </form>
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card
            className={
              sourceFullscreen
                ? "fixed inset-3 z-50 overflow-auto shadow-2xl"
                : ""
            }
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>商品选择</CardTitle>
                  <CardDescription className="mt-2">
                    每页显示 20 条，跨页勾选会保留并写入任务快照。
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {selectedProducts.length}/{products.data?.total || 0}
                  </Badge>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      selectAllProducts.isPending || !products.data?.total
                    }
                    onClick={() => selectAllProducts.mutate()}
                  >
                    {selectAllProducts.isPending
                      ? "选择中…"
                      : `选择全部 ${products.data?.total || 0} 条`}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={!selectedProducts.length}
                    onClick={() => setSelectedProducts([])}
                  >
                    清空选择
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    title="全屏查看"
                    onClick={() => setSourceFullscreen((value) => !value)}
                  >
                    {sourceFullscreen ? (
                      <Minimize2 className="size-4" />
                    ) : (
                      <Maximize2 className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="w-12 p-3">
                        <input
                          type="checkbox"
                          checked={
                            Boolean(preview.length) &&
                            preview.every((item) =>
                              selectedProducts.includes(item.id),
                            )
                          }
                          onChange={(e) =>
                            setSelectedProducts((current) =>
                              e.target.checked
                                ? [
                                    ...new Set([
                                      ...current,
                                      ...preview.map((item) => item.id),
                                    ]),
                                  ]
                                : current.filter(
                                    (id) =>
                                      !preview.some((item) => item.id === id),
                                  ),
                            )
                          }
                        />
                      </th>
                      <th className="p-3 text-left">#</th>
                      {selectedFields.map((field) => (
                        <th key={field} className="p-3 text-left">
                          <span className="block">
                            {PRODUCT_FIELD_META[field]?.label ||
                              PRODUCT_FIELD_LABELS[field] ||
                              field}
                          </span>
                          <span className="text-[10px] font-normal text-muted-foreground">
                            {field}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((product) => (
                      <tr key={product.id}>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(product.id)}
                            onChange={(e) =>
                              setSelectedProducts((current) =>
                                e.target.checked
                                  ? [...current, product.id]
                                  : current.filter((id) => id !== product.id),
                              )
                            }
                          />
                        </td>
                        <td className="p-3 text-muted-foreground">
                          {product.rowIndex + 1}
                        </td>
                        {selectedFields.map((field) => (
                          <td key={field} className="max-w-56 truncate p-3">
                            {String(product.data[field] ?? "")}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  第 {productPage} / {productPages} 页 · 共{" "}
                  {products.data?.total || 0} 条
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={productPage <= 1 || products.isFetching}
                    onClick={() => setProductPage((page) => Math.max(1, page - 1))}
                  >
                    <ChevronLeft className="size-4" /> 上一页
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={productPage >= productPages || products.isFetching}
                    onClick={() =>
                      setProductPage((page) => Math.min(productPages, page + 1))
                    }
                  >
                    下一页 <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>
              {selectAllProducts.error && (
                <p className="mt-2 text-sm text-destructive">
                  {selectAllProducts.error.message}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Languages className="size-5 text-primary" />
                    最近翻译任务
                  </CardTitle>
                  <CardDescription className="mt-2">
                    进度和结果从 PostgreSQL 恢复。
                  </CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void runs.refetch()}
                >
                  <RefreshCw className="size-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {runRows.map((run) => (
                <div key={run.id} className="overflow-hidden rounded-lg border">
                  <button
                    type="button"
                    className="block w-full p-4 text-left transition-colors hover:bg-muted/40"
                    aria-expanded={expandedRuns.includes(run.id)}
                    onClick={() =>
                      setExpandedRuns((current) =>
                        current.includes(run.id)
                          ? current.filter((id) => id !== run.id)
                          : [...current, run.id],
                      )
                    }
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {Array.isArray(run.targetLanguages)
                            ? run.targetLanguages.join(", ")
                            : "翻译任务"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(run.job.createdAt).toLocaleString()} ·{" "}
                          {run.items.length} 个字段单元
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant={
                            run.job.status === "REVIEW" ||
                            run.job.status === "COMPLETED"
                              ? "success"
                              : "outline"
                          }
                        >
                          {run.job.status}
                        </Badge>
                        <ChevronDown
                          className={`size-4 text-muted-foreground transition-transform ${
                            expandedRuns.includes(run.id) ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${run.job.totalItems ? (run.job.completedItems / run.job.totalItems) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </button>
                  {expandedRuns.includes(run.id) &&
                    (run.job.status === "REVIEW" ||
                      run.job.status === "COMPLETED") && (
                      <div className="border-t px-4 pb-4">
                        <ReviewPanel
                          run={run}
                          onChanged={() => void runs.refetch()}
                          onDelete={() => deleteRun.mutate(run.job.id)}
                          deleting={deleteRun.isPending}
                        />
                      </div>
                    )}
                  {expandedRuns.includes(run.id) &&
                    run.job.status !== "REVIEW" &&
                    run.job.status !== "COMPLETED" && (
                      <RunProgressPanel run={run} />
                    )}
                </div>
              ))}
              {runRows.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  暂无翻译任务
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      {mappingOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setMappingOpen(false)}
        />
      )}
      {mappingOpen && (
        <Card className="fixed inset-y-6 right-6 z-50 w-[min(560px,calc(100vw-3rem))] overflow-auto shadow-2xl">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>商品字段映射</CardTitle>
                <CardDescription className="mt-2">
                  把 Excel/CSV
                  字段复制到独立站标准字段；自动识别结果可逐项调整。
                </CardDescription>
              </div>
              <Button variant="ghost" onClick={() => setMappingOpen(false)}>
                关闭
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {headers.map((source) => (
              <div
                key={source}
                className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3"
              >
                <div
                  className="truncate rounded-md border bg-muted/40 px-3 py-2 text-sm"
                  title={source}
                >
                  {source}
                </div>
                <select
                  className="control"
                  value={mappings[source] || ""}
                  onChange={(event) =>
                    setMappings((current) => ({
                      ...current,
                      [source]: event.target.value,
                    }))
                  }
                >
                  <option value="">不映射</option>
                  {CANONICAL_PRODUCT_FIELDS.map((target) => (
                    <option key={target} value={target}>
                      {target} · {PRODUCT_FIELD_LABELS[target] || "标准字段"}
                      {REQUIRED_PRODUCT_FIELDS.has(target) ? "【必填】" : ""}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <Button
              className="w-full"
              disabled={saveMappings.isPending}
              onClick={() => saveMappings.mutate()}
            >
              <Save className="size-4" />
              {saveMappings.isPending ? "映射中…" : "应用映射到当前批次"}
            </Button>
            {saveMappings.error && (
              <p className="text-sm text-destructive">
                {saveMappings.error.message}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function RunProgressPanel({ run }: { run: TranslationRun }) {
  const percent = run.job.totalItems
    ? Math.round((run.job.completedItems / run.job.totalItems) * 100)
    : 0;
  const events = Array.isArray(run.job.events) ? run.job.events : [];
  return (
    <div className="space-y-3 border-t p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">执行进度</span>
        <span className="text-muted-foreground">
          已完成 {run.job.completedItems} / {run.job.totalItems} · {percent}%
        </span>
      </div>
      <div className="max-h-48 space-y-1 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs text-muted-foreground">
        {events.length ? (
          events.map((event) => (
            <p key={event.id} className="break-words">
              {event.createdAt
                ? `${new Date(event.createdAt).toLocaleTimeString()} · `
                : ""}
              {event.message}
            </p>
          ))
        ) : (
          <p>任务已进入队列，等待后台服务更新执行记录…</p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        执行状态每 3 秒自动刷新，关闭页面不会中断任务。
      </p>
    </div>
  );
}

function ReviewPanel({
  run,
  onChanged,
  onDelete,
  deleting,
}: {
  run: TranslationRun;
  onChanged: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [values, setValues] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        run.items.map((item) => [item.id, item.translations || {}]),
      ),
  );
  const [preview, setPreview] = useState<{
    site: { name: string };
    products: Array<{
      productId: string;
      sourceProductId: string;
      translations: Array<Record<string, string>>;
    }>;
  }>();
  const [message, setMessage] = useState("");
  const dirtyItems = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const [saveSelected, setSaveSelected] = useState<string[]>([]);
  const languages = Array.isArray(run.targetLanguages)
    ? run.targetLanguages.map(String)
    : [];
  const [activeLanguage, setActiveLanguage] = useState(languages[0] || "en");
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      for (const item of run.items) {
        if (!dirtyItems.current.has(item.id))
          next[item.id] = item.translations || {};
      }
      return next;
    });
  }, [run.items]);
  const saveItem = async (item: TranslationItem) => {
    const response = await fetch(`/api/translation-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        translations: values[item.id] || {},
        status: "REVIEWED",
      }),
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "保存失败");
    else {
      dirtyItems.current.delete(item.id);
      setDirtyCount(dirtyItems.current.size);
      setMessage("译文已保存");
      onChanged();
    }
  };
  const saveAll = async () => {
    const pending = run.items.filter((item) => dirtyItems.current.has(item.id));
    if (!pending.length) {
      setMessage("没有待保存的人工修改");
      return true;
    }
    setMessage(`正在保存 ${pending.length} 个修改…`);
    try {
      await Promise.all(pending.map((item) => saveItem(item)));
      setMessage(`已保存 ${pending.length} 个修改`);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "批量保存失败");
      return false;
    }
  };
  const saveChecked = async () => {
    const pending = run.items.filter((item) => saveSelected.includes(item.id));
    if (!pending.length) {
      setMessage("请先勾选需要保存的译文");
      return;
    }
    setMessage(`正在保存 ${pending.length} 个选中修改…`);
    try {
      await Promise.all(pending.map((item) => saveItem(item)));
      setSaveSelected([]);
      setMessage(`已保存 ${pending.length} 个选中修改`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存选中失败");
    }
  };
  const complete = async () => {
    if (!(await saveAll())) return;
    const response = await fetch(`/api/translation-jobs/${run.id}/complete`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "确认失败");
    else {
      setMessage("审核已确认完成");
      onChanged();
    }
  };
  const loadPreview = async () => {
    const response = await fetch(`/api/translation-jobs/${run.id}/writeback`);
    const data = await response.json();
    if (!response.ok) setMessage(data.error || "无法生成写回预览");
    else {
      setPreview(data);
      setMessage("");
    }
  };
  const writeback = async () => {
    const response = await fetch(`/api/translation-jobs/${run.id}/writeback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const data = await response.json();
    setMessage(
      response.ok
        ? "已提交后台写回任务，关闭页面不会中断；可在顶部任务中心查看进度"
        : data.error || "写回失败",
    );
    if (response.ok) {
      setPreview(undefined);
      onChanged();
    }
  };
  return (
    <div
      className={`mt-4 space-y-3 ${fullscreen ? "fixed inset-3 z-[70] overflow-auto rounded-xl border bg-card p-5 shadow-2xl" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {languages.map((language) => (
          <Button
            key={language}
            type="button"
            size="sm"
            variant={activeLanguage === language ? "default" : "outline"}
            onClick={() => setActiveLanguage(language)}
          >
            {language} · {languageLabel(language)}
          </Button>
        ))}
        <Button
          className="ml-auto"
          type="button"
          size="icon"
          variant="outline"
          onClick={() => setFullscreen((value) => !value)}
        >
          {fullscreen ? (
            <Minimize2 className="size-4" />
          ) : (
            <Maximize2 className="size-4" />
          )}
        </Button>
      </div>
      <div
        className={
          fullscreen
            ? "max-h-[calc(100vh-12rem)] overflow-auto rounded-lg border"
            : "max-h-72 overflow-auto rounded-lg border"
        }
      >
        <table className="w-full min-w-[760px] text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              <th className="p-3 text-left">字段</th>
              <th className="p-3 text-left">原文</th>
              <th className="p-3 text-left">
                {activeLanguage} · {languageLabel(activeLanguage)}
              </th>
              <th className="w-24 p-3">
                <label className="flex items-center justify-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      run.items.length > 0 &&
                      saveSelected.length === run.items.length
                    }
                    onChange={(event) =>
                      setSaveSelected(
                        event.target.checked
                          ? run.items.map((item) => item.id)
                          : [],
                      )
                    }
                  />
                  保存
                </label>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {run.items.map((item) => (
              <tr key={item.id}>
                <td className="p-3">
                  <span className="block font-medium">
                    {PRODUCT_FIELD_META[item.field]?.label ||
                      PRODUCT_FIELD_LABELS[item.field] ||
                      item.field}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {item.field}
                  </span>
                </td>
                <td className="max-w-md p-3 text-xs text-muted-foreground">
                  {item.sourceText}
                </td>
                <td className="p-3">
                  <Input
                    value={values[item.id]?.[activeLanguage] || ""}
                    onChange={(event) =>
                      setValues((current) => {
                        dirtyItems.current.add(item.id);
                        setDirtyCount(dirtyItems.current.size);
                        return {
                          ...current,
                          [item.id]: {
                            ...(current[item.id] || {}),
                            [activeLanguage]: event.target.value,
                          },
                        };
                      })
                    }
                  />
                </td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    className="mx-auto block size-4"
                    checked={saveSelected.includes(item.id)}
                    onChange={(event) =>
                      setSaveSelected((current) =>
                        event.target.checked
                          ? [...new Set([...current, item.id])]
                          : current.filter((id) => id !== item.id),
                      )
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!dirtyCount}
          onClick={() => void saveAll()}
        >
          <Save className="size-3.5" />
          保存所有已修改
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!saveSelected.length}
          onClick={() => void saveChecked()}
        >
          <Save className="size-3.5" />
          {saveSelected.length === run.items.length && run.items.length
            ? "保存全部修改"
            : `保存选中 ${saveSelected.length} 项`}
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={`/api/translation-jobs/${run.id}/export`}>
            <Download className="size-3.5" />
            导出 XLSX
          </a>
        </Button>
        {run.job.status === "REVIEW" && (
          <Button size="sm" onClick={() => void complete()}>
            <CheckCircle2 className="size-3.5" />
            确认审核完成
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={run.job.status !== "COMPLETED"}
          title={run.job.status !== "COMPLETED" ? "请先确认审核完成" : ""}
          onClick={() => void loadPreview()}
        >
          <Send className="size-3.5" />
          同步到独立站（先预览）
        </Button>
        <Button
          size="sm"
          variant="destructive"
          className="ml-auto"
          disabled={deleting}
          onClick={onDelete}
        >
          {deleting ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          删除任务
        </Button>
      </div>
      {preview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <p className="font-medium">
            即将写回 {preview.site.name}：{preview.products.length} 个商品
          </p>
          <p className="mt-1 text-xs">
            此操作会修改独立站翻译数据，并为每个商品记录幂等写回结果。
          </p>
          <Button
            size="sm"
            variant="destructive"
            className="mt-3"
            onClick={() => void writeback()}
          >
            确认写回独立站
          </Button>
        </div>
      )}
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
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

function LanguagePicker({
  value,
  baseLanguage,
  siteLanguages,
  showSiteWords,
  showLabels,
  onChange,
}: {
  value: string[];
  baseLanguage: string;
  siteLanguages: unknown;
  showSiteWords: boolean;
  showLabels: boolean;
  onChange: (value: string[]) => void;
}) {
  const site = Array.isArray(siteLanguages)
    ? siteLanguages.map(String).filter((code) => code && code !== baseLanguage)
    : [];
  const options = Array.from(
    new Set([
      ...site,
      ...COMMON_LANGUAGES.filter((code) => code !== baseLanguage),
    ]),
  );
  const toggle = (code: string) =>
    onChange(
      value.includes(code)
        ? value.filter((item) => item !== code)
        : [...value, code],
    );
  const allSiteSelected =
    site.length > 0 && site.every((code) => value.includes(code));
  return (
    <div className="space-y-2">
      <div className="flex max-h-32 flex-wrap gap-2 overflow-auto rounded-lg border p-3">
        {options.map((code) => (
          <Button
            key={code}
            type="button"
            size="sm"
            variant={value.includes(code) ? "default" : "outline"}
            onClick={() => toggle(code)}
          >
            <span>
              {code}
              {showLabels && (
                <span className="ml-1 text-[10px] opacity-70">
                  {languageLabel(code)}
                </span>
              )}
            </span>
            {showSiteWords && site.includes(code) && (
              <span className="ml-1 text-[10px] opacity-70">站点</span>
            )}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          源语言：{baseLanguage || "自动识别"} · 已选 {value.length} 种
        </span>
        {site.length > 0 && (
          <button
            type="button"
            className="text-primary"
            onClick={() => onChange(allSiteSelected ? [] : site)}
          >
            {showSiteWords
              ? allSiteSelected
                ? "取消全部站点语言"
                : "选择全部站点语言"
              : allSiteSelected
                ? "取消全部语言"
                : "选择全部语言"}
          </button>
        )}
      </div>
    </div>
  );
}
