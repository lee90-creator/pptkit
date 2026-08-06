import { z } from "zod";

import { AssetProvenanceSchema } from "./asset.js";
import { SlideIdSchema } from "./ids.js";
import { SemanticVisualIntentSchema, VisualSchema, VisualTypeSchema } from "./visual.js";

export const HeaderSkinSchema = z.enum(["kch-framed-right", "shinan-line-left"]);

export const BodyBlockSchema = z
	.object({
		title: z.string().min(1).optional(),
		text: z.string().min(1),
	})
	.strict();

export const ImageIntentSchema = z
	.object({
		action: z.enum(["select", "generate", "none"]),
		query: z.string().min(1).optional(),
		nativeFallback: VisualTypeSchema.exclude(["image"]),
	})
	.strict();

export const ProviderSlideSchema = z.object({
	id: SlideIdSchema,
	purpose: z.string().min(1),
	claim: z.string().min(1),
	title: z.string().min(1),
	bodyBlocks: z.array(BodyBlockSchema).max(3),
	visual: SemanticVisualIntentSchema,
	imageIntent: ImageIntentSchema,
	headerSkin: HeaderSkinSchema.optional(),
	usePanorama: z.boolean(),
});

export const SlideSchema = z
	.object({
		id: SlideIdSchema,
		purpose: z.string().min(1),
		claim: z.string().min(1),
		title: z.string().min(1),
		bodyBlocks: z.array(BodyBlockSchema).max(3),
		visual: VisualSchema,
		imageIntent: ImageIntentSchema,
		provenance: z.array(AssetProvenanceSchema),
		headerSkin: HeaderSkinSchema.optional(),
		usePanorama: z.boolean(),
	})
	.strict();

export type Slide = z.infer<typeof SlideSchema>;
