export const LANGUAGE_LABELS: Record<string, string> = {
  en: "英语",
  "zh-CN": "简体中文",
  "zh-TW": "繁体中文",
  ja: "日语",
  ko: "韩语",
  de: "德语",
  fr: "法语",
  es: "西班牙语",
  it: "意大利语",
  pt: "葡萄牙语",
  nl: "荷兰语",
  pl: "波兰语",
  ru: "俄语",
  ar: "阿拉伯语",
  tr: "土耳其语",
  th: "泰语",
  vi: "越南语",
  id: "印度尼西亚语",
  ms: "马来语",
  hi: "印地语",
};
export const languageLabel = (code: string) =>
  LANGUAGE_LABELS[code] || "其他语言";
