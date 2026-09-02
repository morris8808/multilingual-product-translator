import { z } from "zod";

const position = z.enum([
  "northwest", "north", "northeast", "west", "center",
  "east", "southwest", "south", "southeast",
]);
const targets = z.array(z.object({
  imageId: z.string().min(1),
  versionId: z.string().min(1).nullable(),
})).min(1).max(50).refine(
  (items) => new Set(items.map((item) => `${item.imageId}:${item.versionId || "ORIGINAL"}`)).size === items.length,
  "不能重复选择同一个图片版本",
);

export const imageEditSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("CROP"),
    targets,
    aspectRatio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16"]),
    position,
  }),
  z.object({
    operation: z.literal("RESIZE"),
    targets,
    width: z.coerce.number().int().min(64).max(10000),
    height: z.coerce.number().int().min(64).max(10000),
    fit: z.enum(["cover", "contain", "fill", "inside", "outside"]),
    background: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),
  }),
  z.object({
    operation: z.literal("WATERMARK_IMAGE"),
    targets,
    watermarkUrl: z.string().startsWith("/uploads/private/watermarks/"),
    scale: z.coerce.number().min(5).max(80),
    opacity: z.coerce.number().min(0.05).max(1),
    margin: z.coerce.number().int().min(0).max(1000),
    position,
  }),
  z.object({
    operation: z.literal("WATERMARK_TEXT"),
    targets,
    text: z.string().trim().min(1).max(200),
    fontSize: z.coerce.number().int().min(10).max(500),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    opacity: z.coerce.number().min(0.05).max(1),
    margin: z.coerce.number().int().min(0).max(1000),
    position,
  }),
]);
