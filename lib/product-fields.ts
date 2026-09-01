export const PRODUCT_FIELD_META: Record<
  string,
  { label: string; description: string; required?: boolean }
> = {
  id: { label: "商品 ID", description: "独立站商品唯一编号", required: true },
  handle: {
    label: "商品链接标识",
    description: "商品页面 URL 使用的唯一标识",
    required: true,
  },
  spu: { label: "SPU", description: "同一商品组的标准编码" },
  sku: { label: "SKU", description: "商品或变体库存编码" },
  title: {
    label: "商品标题",
    description: "独立站前台展示的主标题",
    required: true,
  },
  sub_title: { label: "副标题", description: "商品标题下方的补充说明" },
  body_html: { label: "商品详情", description: "商品详情页 HTML 内容" },
  vendor: { label: "品牌/供应商", description: "商品所属品牌或供应商" },
  product_type: { label: "商品类型", description: "商品分类类型" },
  tags: { label: "商品标签", description: "搜索、筛选和自动分类标签" },
  status: {
    label: "商品状态",
    description: "上架、草稿或归档状态",
    required: true,
  },
  meta_title: { label: "SEO 标题", description: "搜索结果中显示的页面标题" },
  meta_keywords: { label: "SEO 关键词", description: "商品页面搜索关键词" },
  meta_description: { label: "SEO 描述", description: "搜索结果中的商品摘要" },
  price: { label: "销售价格", description: "商品当前销售价格" },
  compare_at_price: { label: "划线价格", description: "用于展示折扣的原价" },
  inventory_quantity: { label: "库存数量", description: "当前可销售库存" },
  inventory_policy_type: {
    label: "库存策略",
    description: "缺货后是否允许继续销售",
  },
  inventory_police_type: {
    label: "库存策略",
    description: "缺货后是否允许继续销售",
  },
  images: { label: "商品图片", description: "商品主图和详情图片列表" },
  options: { label: "商品选项", description: "颜色、尺寸等变体选项" },
  variants: { label: "商品变体", description: "SKU、价格和库存变体数据" },
  collectionIds: { label: "商品专辑", description: "商品所属专辑编号" },
  tagIds: { label: "标签编号", description: "商品绑定的标签 ID" },
  created_at: { label: "创建时间", description: "独立站商品创建时间" },
  updated_at: { label: "更新时间", description: "独立站商品最后更新时间" },
};

export const DEFAULT_PRODUCT_FIELDS = Object.keys(PRODUCT_FIELD_META);
