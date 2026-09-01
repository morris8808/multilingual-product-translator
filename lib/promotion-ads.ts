export type PromotionAd = {
  id: string;
  type: "JOFSHOP" | "CUSTOM" | "NOTICE";
  badge: string;
  title: string;
  description: string;
  buttonLabel: string;
  url: string;
  enabled: boolean;
};

export const JOFSHOP_REGISTER_URL =
  "https://login.jofshop.com/api_member_guide/guide?step=register";

export const DEFAULT_PROMOTION_ADS: PromotionAd[] = [
  {
    id: "jofshop-register",
    type: "JOFSHOP",
    badge: "推广专区",
    title: "还没有独立站？让处理完成的商品直接上线销售",
    description:
      "注册 JOFSHOP 店铺后，可将这里整理、翻译和优化完成的商品数据直接写回站点，减少重复导入导出，形成从商品处理到多语言发布的完整流程。",
    buttonLabel: "免费注册 JOFSHOP",
    url: JOFSHOP_REGISTER_URL,
    enabled: true,
  },
];
