import { GeneratedImageSchema } from "./types.js";
import type { GeneratedImage } from "./types.js";

export function parseLicensedStockCandidate(candidate: unknown): GeneratedImage {
	return GeneratedImageSchema.parse(candidate);
}
