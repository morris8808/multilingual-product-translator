import { z } from "zod";
export const termInputSchema=z.object({id:z.string().optional(),source:z.string().trim().min(1).max(200),mode:z.enum(["FIXED","PRESERVE"]),category:z.enum(["brand","model","industry","custom"]),enabled:z.boolean(),caseSensitive:z.boolean(),spaceAfter:z.boolean(),note:z.string().trim().max(500).optional().or(z.literal("")),translations:z.record(z.string().min(1).max(20),z.string().max(1000))});
export type TermInput=z.infer<typeof termInputSchema>;
