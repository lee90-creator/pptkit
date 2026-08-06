import { type SlideSpecDocument, normalizeNarrative } from "./normalize.js";

export function planNarrative(providerOutput: unknown): SlideSpecDocument {
	return normalizeNarrative(providerOutput);
}
