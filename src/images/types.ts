import { z } from "zod";

import type { AssetProvenance } from "../schema/asset.js";

export interface SuppliedImage {
	readonly path: string;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly identifier: string;
	readonly licenseStatus: string;
}

export interface ImageRequest {
	readonly assetId: string;
	readonly slideId: string;
	readonly alt: string;
	readonly purpose: string;
	readonly aspectRatio: number;
	readonly supplied?: SuppliedImage;
}

export const GeneratedImageSchema = z
	.object({
		path: z.string().min(1).optional(),
		data: z.string().min(1).optional(),
		pixelWidth: z.number().int().positive(),
		pixelHeight: z.number().int().positive(),
		identifier: z.string().min(1),
		licenseStatus: z.string().min(1).optional(),
	})
	.strict()
	.refine((value) => value.path !== undefined || value.data !== undefined, {
		message: "이미지 path 또는 data가 필요합니다.",
	});

export type GeneratedImage = z.infer<typeof GeneratedImageSchema>;

export interface ResolvedImageAsset extends GeneratedImage {
	readonly assetId: string;
	readonly alt: string;
	readonly provenance: AssetProvenance;
}

export type ImagePipelineStage = "supplied" | "codex-extension" | "openai-api" | "stock" | "native-fallback";

export interface ImageAttempt {
	readonly stage: ImagePipelineStage;
	readonly status: "resolved" | "failed" | "skipped";
	readonly detail?: string;
}

export interface NativeImageFallback {
	readonly nativeObject: "shape";
	readonly icon: "image-placeholder";
	readonly alt: string;
	readonly caption: string;
	readonly reason: "image-providers-unavailable";
}

export type ImageResolution =
	| {
			readonly status: "resolved";
			readonly asset: ResolvedImageAsset;
			readonly attempts: readonly ImageAttempt[];
	  }
	| {
			readonly status: "native-fallback";
			readonly fallback: NativeImageFallback;
			readonly attempts: readonly ImageAttempt[];
	  };

export type ImageGenerator = (prompt: string) => Promise<GeneratedImage>;
