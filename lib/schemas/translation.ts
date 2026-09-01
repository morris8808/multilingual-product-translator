import { z } from "zod";
export const translationJobInputSchema = z.object({
  batchId: z.string(),
  modelConnectionId: z.string(),
  sourceLanguage: z.string().min(2).max(20),
  targetLanguages: z.array(z.string().min(2).max(20)).min(1).max(20),
  fields: z.array(z.string().min(1).max(120)).min(1).max(50),
  productIds: z.array(z.string()).max(10000).optional(),
});
export type TranslationJobInput = z.infer<typeof translationJobInputSchema>;
