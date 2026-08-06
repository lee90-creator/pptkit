import type { ImageRequest, NativeImageFallback } from "./types.js";

export function nativeImageFallback(request: ImageRequest): NativeImageFallback {
	return {
		nativeObject: "shape",
		icon: "image-placeholder",
		alt: request.alt,
		caption: request.purpose,
		reason: "image-providers-unavailable",
	};
}
