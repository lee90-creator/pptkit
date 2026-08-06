import { z } from "zod";

export const BootstrapStepStateSchema = z.enum(["CHECK", "INSTALL", "SKIP", "WARN", "BLOCKED"]);
export const SupportTierSchema = z.enum(["A", "B", "C"]);

const NormalStepSchema = z
	.object({
		id: z.string().min(1),
		state: BootstrapStepStateSchema.exclude(["BLOCKED"]),
		supportTier: SupportTierSchema,
		message: z.string().min(1),
	})
	.strict();

const BlockedStepSchema = z
	.object({
		id: z.string().min(1),
		state: z.literal("BLOCKED"),
		supportTier: SupportTierSchema,
		message: z.string().min(1),
		path: z.string().min(1),
		sha256: z.string().regex(/^[a-f0-9]{64}$/u),
		itAction: z.string().regex(/[가-힣]/u),
	})
	.strict();

export const BootstrapStepResultSchema = z.discriminatedUnion("state", [NormalStepSchema, BlockedStepSchema]);

export type BootstrapStepResult = z.infer<typeof BootstrapStepResultSchema>;
