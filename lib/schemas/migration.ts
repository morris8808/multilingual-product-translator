import { z } from "zod";

const jsonRecord = z.record(z.string(), z.unknown());
export const legacyTermSchema = z.object({
  id: z.string().optional(), source: z.string().trim().min(1), rule: z.enum(["preserve", "fixed"]),
  category: z.string().optional(), translations: z.record(z.string(), z.string()).default({}),
  enabled: z.boolean().default(true), spaceAfter: z.boolean().optional(),
});
export const legacyMigrationSchema = z.object({
  migrationKey: z.string().min(16).max(128),
  preferences: z.object({ theme: z.enum(["light", "dark", "system"]).optional(), sidebarCollapsed: z.boolean().optional(), pageSize: z.number().int().min(5).max(200).optional() }).optional(),
  site: jsonRecord.optional(), textModel: jsonRecord.optional(), imageModel: jsonRecord.optional(),
  fieldRules: jsonRecord.optional(), terms: z.array(legacyTermSchema).max(10000).default([]),
  prepareTask: jsonRecord.optional(), translationTask: jsonRecord.optional(),
});
export type LegacyMigrationInput = z.infer<typeof legacyMigrationSchema>;
