import { z } from "zod";
export const translationItemReviewSchema = z.object({
  translations: z.record(z.string().min(2).max(20), z.string().max(100000)),
  status: z.enum(["COMPLETED", "REVIEWED"]).default("REVIEWED"),
});
export const writebackSchema = z.object({ confirm: z.literal(true) });
