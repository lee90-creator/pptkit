import { z } from "zod";

export const DocumentIdSchema = z.string().min(1).brand<"DocumentId">();
export const SlideIdSchema = z.string().min(1).brand<"SlideId">();
export const AssetIdSchema = z.string().min(1).brand<"AssetId">();
export const NodeIdSchema = z.string().min(1).brand<"NodeId">();
export const StepIdSchema = z.string().min(1).brand<"StepId">();

export type DocumentId = z.infer<typeof DocumentIdSchema>;
export type SlideId = z.infer<typeof SlideIdSchema>;
export type AssetId = z.infer<typeof AssetIdSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type StepId = z.infer<typeof StepIdSchema>;
