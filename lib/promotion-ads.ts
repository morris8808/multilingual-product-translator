export type PromotionAd = {
  id: string;
  type: "CUSTOM" | "NOTICE";
  badge: string;
  title: string;
  description: string;
  buttonLabel: string;
  url: string;
  enabled: boolean;
};

export const DEFAULT_PROMOTION_ADS: PromotionAd[] = [];
