import { z } from "zod";
import { STORAGE_PROVIDERS } from "@/lib/storage-catalog";
const codes=STORAGE_PROVIDERS.map(item=>item.code) as [string,...string[]];
export const storageSchema=z.object({
  target:z.enum(["SITE","OWN"]), id:z.string().optional(), provider:z.enum(codes),
  name:z.string().trim().min(1).max(80), endpoint:z.string().trim().url(), region:z.string().trim().max(80).optional(),
  bucket:z.string().trim().min(1).max(160), publicBaseUrl:z.string().trim().url().optional().or(z.literal("")),
  pathPrefix:z.string().trim().max(200).default("multilingual-workbench"), accessKey:z.string().optional(), secretKey:z.string().optional(),
  forcePathStyle:z.boolean(), enabled:z.boolean(),
});
