import { z } from "zod";
export const productPatchSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});
export const bulkReplaceSchema = z.object({
  field: z.string().min(1).max(120),
  search: z.string().min(1).max(10000),
  replacement: z.string().max(10000),
  productIds: z.array(z.string()).max(10000).optional(),
  caseSensitive: z.boolean().default(false),
  mode: z.enum(["contains", "exact", "regex"]).default("contains"),
});
export const fieldDefinitionSchema = z.object({
  id: z.string().optional(),
  key: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[\p{L}\p{N}_-]+$/u, "字段键只能包含文字、数字、下划线和连字符"),
  label: z.string().trim().min(1).max(120),
  type: z.enum([
    "TEXT",
    "MULTILINE",
    "NUMBER",
    "BOOLEAN",
    "DATE",
    "URL",
    "IMAGE",
    "HTML",
    "JSON",
    "AI",
    "TRANSLATION",
    "FORMULA",
    "REFERENCE",
  ]),
  defaultValue: z.unknown().optional(),
  hidden: z.boolean(),
  frozen: z.boolean(),
  position: z.number().int().min(0),
  rule: z
    .object({
      kind: z.string().min(1),
      config: z.record(z.string(), z.unknown()),
    })
    .optional(),
});
export type FieldDefinitionInput = z.infer<typeof fieldDefinitionSchema>;
