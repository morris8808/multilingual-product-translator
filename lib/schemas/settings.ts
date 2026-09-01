import { z } from "zod";

export const preferenceSchema = z.object({
  theme: z.enum(["light", "dark", "system", "custom"]),
  pageSize: z.number().int().min(5).max(200),
  sidebarCollapsed: z.boolean(),
  stickyHeader: z.boolean(),
  tableDensity: z.enum(["compact", "comfortable", "spacious"]),
  developerMode: z.boolean(),
  imagePageSize: z.number().int().min(12).max(60),
  showLanguageLabels: z.boolean(),
  showOnlineProductLink: z.boolean(),
  customTheme: z.object({
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    foreground: z.string().regex(/^#[0-9a-f]{6}$/i),
    card: z.string().regex(/^#[0-9a-f]{6}$/i),
    primary: z.string().regex(/^#[0-9a-f]{6}$/i),
    sidebar: z.string().regex(/^#[0-9a-f]{6}$/i),
    border: z.string().regex(/^#[0-9a-f]{6}$/i),
    destructive: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
});

export const workspaceBrandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(120).optional().or(z.literal("")),
  logoUrl: z
    .string()
    .trim()
    .refine((value) => !value || value.startsWith("/") || /^https?:\/\//i.test(value), "Logo 地址无效")
    .optional(),
});

export const siteConnectionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(80),
  platform: z.string().trim().min(1).max(40),
  apiUrl: z.string().trim().url(),
  token: z.string().min(1).optional(),
  baseLanguage: z.string().trim().max(20).optional(),
  enabledLanguages: z.array(z.string()),
});

export const modelConnectionSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["TEXT", "IMAGE"]),
  provider: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(80),
  apiBase: z.string().trim().url().optional().or(z.literal("")),
  apiKey: z.string().optional(),
  model: z.string().trim().min(1).max(160),
  capabilities: z.array(z.string()),
  enabled: z.boolean(),
});

export type PreferenceInput = z.infer<typeof preferenceSchema>;
export type WorkspaceBrandInput = z.infer<typeof workspaceBrandSchema>;
