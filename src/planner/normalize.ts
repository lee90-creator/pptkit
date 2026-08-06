import { z } from "zod";

import { AssetProvenanceSchema } from "../schema/asset.js";
import { DocumentModeSchema } from "../schema/document.js";
import { ProviderSlideSchema } from "../schema/slide.js";

export { DocumentModeSchema } from "../schema/document.js";
export { HeaderSkinSchema } from "../schema/slide.js";
export { VisualTypeSchema } from "../schema/visual.js";

export const ProviderNarrativeSchema = z.object({
	title: z.string().min(1),
	purpose: z.string().min(1),
	audience: z.string().min(1),
	mode: DocumentModeSchema,
	slides: z.array(ProviderSlideSchema).min(1),
});

export const SlideSpecSchema = ProviderSlideSchema.extend({
	order: z.number().int().positive(),
	provenance: z.array(AssetProvenanceSchema).length(0),
});

export const SlideSpecDocumentSchema = ProviderNarrativeSchema.omit({ slides: true }).extend({
	slides: z.array(SlideSpecSchema).min(1),
});

export type ProviderNarrative = z.infer<typeof ProviderNarrativeSchema>;
export type SlideSpec = z.infer<typeof SlideSpecSchema>;
export type SlideSpecDocument = z.infer<typeof SlideSpecDocumentSchema>;

export function normalizeNarrative(input: unknown): SlideSpecDocument {
	const narrative = ProviderNarrativeSchema.parse(input);
	return SlideSpecDocumentSchema.parse({
		...narrative,
		slides: narrative.slides.map((slide, index) => ({ ...slide, order: index + 1, provenance: [] })),
	});
}
