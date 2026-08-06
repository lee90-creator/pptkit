import { z } from "zod";

const CleanupSchema = z
	.object({
		ownedProcesses: z.number().int().nonnegative(),
		ownedTempPaths: z.number().int().nonnegative(),
	})
	.strict();

const VerifiedSchema = z
	.object({
		status: z.literal("verified"),
		originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
		slideCount: z.number().int().positive(),
		pngCount: z.number().int().positive(),
		pdfPageCount: z.number().int().positive(),
		roundtripPngCount: z.number().int().positive(),
		roundtripPath: z.string().min(1),
		edits: z
			.object({
				text: z.literal(true),
				table: z.literal(true),
				chart: z.literal(true),
			})
			.strict(),
		cleanup: CleanupSchema,
	})
	.strict();

export const OfficeQaReasonSchema = z.enum([
	"powerpoint-unavailable",
	"invocation-failed",
	"process-timeout",
	"malformed-result",
	"render-failed",
	"source-mutated-restored",
	"disabled-by-user",
]);

const UnverifiedSchema = z
	.object({
		status: z.literal("render-unverified"),
		reason: OfficeQaReasonSchema,
		originalSha256: z.string().regex(/^[a-f0-9]{64}$/),
		detail: z.string().min(1).optional(),
		cleanup: CleanupSchema,
	})
	.strict();

export const OfficeQaResultSchema = z.discriminatedUnion("status", [VerifiedSchema, UnverifiedSchema]);

export type OfficeQaReason = z.infer<typeof OfficeQaReasonSchema>;
export type OfficeQaResult = z.infer<typeof OfficeQaResultSchema>;
