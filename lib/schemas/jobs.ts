import { z } from "zod";
export const createJobSchema = z.object({
  type: z.literal("SYSTEM_TEST"),
  steps: z.number().int().min(3).max(60).default(10),
  delayMs: z.number().int().min(250).max(10000).default(1000),
});
export const jobActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["pause", "resume", "cancel", "retry"]) }),
  z.object({
    action: z.literal("rename"),
    displayName: z.string().trim().min(1).max(80),
  }),
]);
