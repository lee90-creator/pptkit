import { z } from "zod";

export const ProviderNameSchema = z.enum(["codex", "claude"]);
export const ProviderStatusSchema = z.enum(["authenticated", "installed-unauthenticated", "missing", "unusable"]);

export const ProviderEnvelopeSchema = z.discriminatedUnion("state", [
	z
		.object({
			provider: ProviderNameSchema,
			state: z.literal("missing"),
		})
		.strict(),
	z
		.object({
			provider: ProviderNameSchema,
			state: ProviderStatusSchema.exclude(["missing"]),
			executable: z.string().min(1),
			detail: z.string().min(1).optional(),
		})
		.strict(),
]);

export const StructuredProviderResultSchema = z
	.object({
		provider: ProviderNameSchema,
		value: z.unknown(),
	})
	.strict();

export type ProviderEnvelope = z.infer<typeof ProviderEnvelopeSchema>;
