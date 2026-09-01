import { z } from "zod";

export const imageJobSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(50),
  modelConnectionId: z.string().min(1),
  operation: z.enum(["GENERATE", "BACKGROUND", "UPSCALE", "LOCALIZE"]),
  prompt: z.string().trim().min(3).max(4000),
});

export const imageReviewSchema = z.object({
  action: z.enum(["approve", "reject", "apply"]),
  confirm: z.boolean().optional(),
});
export const imageArchiveSchema = z.object({
  imageIds: z.array(z.string().min(1)).min(1).max(100),
  mode: z.enum(["original", "adopted"]).default("original"),
});
