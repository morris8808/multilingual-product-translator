export const TEXT_PROVIDERS = [
  ["ollama", "本机 Ollama", "本地 / 开源"],
  ["openai", "OpenAI", "海外 / 闭源"],
  ["anthropic", "Anthropic Claude", "海外 / 闭源"],
  ["google", "Google Gemini", "海外 / 闭源"],
  ["deepseek", "DeepSeek", "国内 / 闭源"],
  ["dashscope", "阿里云百炼", "国内 / 多模型"],
  ["volcengine", "火山方舟", "国内 / 多模型"],
  ["siliconflow", "硅基流动", "国内 / 开源托管"],
  ["openrouter", "OpenRouter", "海外 / 聚合"],
  ["custom", "自定义兼容接口", "自定义"],
] as const;

export const IMAGE_PROVIDERS = [
  ["qwen-image", "Qwen-Image", "国内 / 开源与托管"],
  ["seedream", "Seedream", "国内 / 闭源"],
  ["hunyuan", "腾讯混元图像", "国内"],
  ["cogview", "智谱 CogView", "国内"],
  ["gpt-image", "OpenAI GPT Image", "海外 / 闭源"],
  ["imagen", "Google Imagen", "海外 / 闭源"],
  ["firefly", "Adobe Firefly", "海外 / 闭源"],
  ["flux", "Black Forest Labs FLUX", "海外 / 开源与闭源"],
  ["stability", "Stability AI", "海外 / 开源与闭源"],
  ["comfyui", "ComfyUI", "本地 / 开源"],
  ["automatic1111", "Stable Diffusion WebUI", "本地 / 开源"],
  ["custom", "自定义图片接口", "自定义"],
] as const;

export const MODEL_PRESETS: Record<
  string,
  { name: string; apiBase: string; models: string[]; capabilities: string[] }
> = {
  ollama: {
    name: "本机 Ollama",
    apiBase: "http://localhost:11434",
    models: ["hy-mt1.5", "qwen3:8b", "llama3.1:8b"],
    capabilities: ["translation", "local"],
  },
  openai: {
    name: "OpenAI",
    apiBase: "https://api.openai.com/v1",
    models: ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"],
    capabilities: ["translation", "json"],
  },
  anthropic: {
    name: "Anthropic Claude",
    apiBase: "https://api.anthropic.com/v1",
    models: ["claude-sonnet-4-5", "claude-haiku-4-5"],
    capabilities: ["translation", "long-context"],
  },
  google: {
    name: "Google Gemini",
    apiBase: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    capabilities: ["translation", "vision"],
  },
  deepseek: {
    name: "DeepSeek",
    apiBase: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    capabilities: ["translation", "reasoning"],
  },
  dashscope: {
    name: "阿里云百炼",
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-plus", "qwen-max", "qwen-turbo"],
    capabilities: ["translation", "json"],
  },
  volcengine: {
    name: "火山方舟",
    apiBase: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-seed-1-6-flash", "doubao-seed-1-6"],
    capabilities: ["translation"],
  },
  siliconflow: {
    name: "硅基流动",
    apiBase: "https://api.siliconflow.cn/v1",
    models: ["Qwen/Qwen3-8B", "deepseek-ai/DeepSeek-V3"],
    capabilities: ["translation", "open-models"],
  },
  openrouter: {
    name: "OpenRouter",
    apiBase: "https://openrouter.ai/api/v1",
    models: [
      "openai/gpt-4o-mini",
      "google/gemini-2.5-flash",
      "anthropic/claude-sonnet-4",
    ],
    capabilities: ["translation", "aggregator"],
  },
  comfyui: {
    name: "本机 ComfyUI",
    apiBase: "http://localhost:8188",
    models: ["workflow-default"],
    capabilities: ["image", "local"],
  },
  automatic1111: {
    name: "Stable Diffusion WebUI",
    apiBase: "http://localhost:7860",
    models: ["stable-diffusion"],
    capabilities: ["image", "local"],
  },
  "gpt-image": {
    name: "OpenAI GPT Image",
    apiBase: "https://api.openai.com/v1",
    models: ["gpt-image-1.5", "gpt-image-1"],
    capabilities: ["image"],
  },
  imagen: {
    name: "Google Imagen",
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    models: ["imagen-4.0-generate-001"],
    capabilities: ["image"],
  },
  "qwen-image": {
    name: "Qwen-Image",
    apiBase: "https://dashscope.aliyuncs.com/api/v1",
    models: ["qwen-image-plus", "qwen-image"],
    capabilities: ["image"],
  },
  seedream: {
    name: "火山 Seedream",
    apiBase: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-seedream-4-0"],
    capabilities: ["image"],
  },
  hunyuan: {
    name: "腾讯混元图像",
    apiBase: "https://hunyuan.tencentcloudapi.com",
    models: ["hunyuan-image"],
    capabilities: ["image"],
  },
  cogview: {
    name: "智谱 CogView",
    apiBase: "https://open.bigmodel.cn/api/paas/v4",
    models: ["cogview-4"],
    capabilities: ["image"],
  },
  flux: {
    name: "Black Forest Labs FLUX",
    apiBase: "https://api.bfl.ai/v1",
    models: ["flux-pro-1.1", "flux-kontext-pro"],
    capabilities: ["image"],
  },
  stability: {
    name: "Stability AI",
    apiBase: "https://api.stability.ai/v2beta",
    models: ["stable-image-ultra", "stable-image-core"],
    capabilities: ["image"],
  },
  firefly: {
    name: "Adobe Firefly",
    apiBase: "https://firefly-api.adobe.io/v3",
    models: ["firefly-image-3"],
    capabilities: ["image"],
  },
  custom: { name: "自定义兼容接口", apiBase: "", models: [], capabilities: [] },
};
