import { z } from "zod";

import { DocumentIdSchema } from "./ids.js";
import { HeaderSkinSchema, SlideSchema } from "./slide.js";

export const DocumentModeSchema = z.enum(["corporate", "wind-industrial"]);
export const RenderStatusSchema = z.enum(["verified", "render-unverified"]);

export const DocumentSchema = z
	.object({
		id: DocumentIdSchema,
		title: z.string().min(1),
		purpose: z.string().min(1),
		audience: z.string().min(1),
		mode: DocumentModeSchema,
		headerSkin: HeaderSkinSchema,
		renderStatus: RenderStatusSchema,
		slides: z.array(SlideSchema).min(1),
	})
	.strict();

export type Document = z.infer<typeof DocumentSchema>;
