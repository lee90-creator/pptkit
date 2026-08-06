import { createHash } from "node:crypto";

import type { ImageRequest } from "./types.js";

export interface ImagePrompt {
	readonly text: string;
	readonly sha256: string;
}

export function buildImagePrompt(request: ImageRequest): ImagePrompt {
	const text = [
		"Create a professional corporate presentation image for KCH.",
		`Purpose: ${request.purpose}.`,
		`Accessibility description: ${request.alt}.`,
		`Target aspect ratio: ${request.aspectRatio.toFixed(4)}.`,
		"Use realistic business photography or restrained editorial illustration.",
		"Do not include text, logos, charts, tables, watermarks, or invented numeric claims.",
		"Keep a calm blue-compatible palette and clear negative space for slide layout.",
	].join("\n");
	return { text, sha256: createHash("sha256").update(text).digest("hex") };
}
