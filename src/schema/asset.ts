import { z } from "zod";

import { SlideIdSchema } from "./ids.js";

export const AssetSourceSchema = z.enum(["provided", "reference", "openai-api", "codex-extension", "stock"]);

export const AssetProvenanceSchema = z
	.object({
		source: AssetSourceSchema,
		identifier: z.string().min(1),
		promptHash: z
			.string()
			.regex(/^[a-f0-9]{64}$/u)
			.nullable(),
		createdAt: z.string().refine((value) => {
			const parsed = new Date(value);
			return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
		}),
		licenseStatus: z.string().min(1),
		slideId: SlideIdSchema,
	})
	.strict();

export type AssetProvenance = z.infer<typeof AssetProvenanceSchema>;
