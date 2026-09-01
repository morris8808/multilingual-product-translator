import { z } from "zod";

export const contentEntitySchema = z.enum([
  "collections",
  "articles",
  "blog-collections",
  "pages",
  "site",
]);

export const contentImportSchema = z.object({
  entity: contentEntitySchema,
  siteId: z.string().min(1),
});

export const contentTranslationJobSchema = z.object({
  entity: contentEntitySchema,
  recordIds: z.array(z.string()).min(1).max(5000),
  modelConnectionId: z.string().min(1),
  sourceLanguage: z.string().min(2).max(20).default("auto"),
  targetLanguages: z.array(z.string().min(2).max(20)).min(1).max(20),
  fields: z.array(z.string().min(1).max(120)).min(1).max(30),
});

export type ContentEntity = z.infer<typeof contentEntitySchema>;
export type ContentTranslationJobInput = z.infer<
  typeof contentTranslationJobSchema
>;
