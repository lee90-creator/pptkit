import { describe, expect, test } from "bun:test";

import { DiagramRenderError } from "../../src/renderer/diagrams.js";
import { buildImageCalloutPlan } from "../../src/renderer/image-callout.js";
import { expectNativePlan, objectsOfKind, texts } from "./diagram-test-helpers.js";

describe("image callout", () => {
	const asset = {
		assetId: "panorama",
		path: "assets/panoramas/shinan-panorama.png",
		pixelWidth: 4397,
		pixelHeight: 382,
		provenance: {
			source: "reference",
			identifier: "ppt/media/image2.png",
			licenseStatus: "internal-use-only",
		},
	} as const;

	test("preserves the source aspect ratio and provenance", () => {
		const plan = buildImageCalloutPlan({
			asset,
			alt: "신안 해상풍력 파노라마",
			caption: "신안 해상풍력 단지 전경",
		});
		expect(plan.kind).toBe("image-callout");
		expectNativePlan(plan);
		const image = objectsOfKind(plan, "image")[0];
		if (!image) {
			throw new Error("missing image object");
		}
		const sourceRatio = asset.pixelWidth / asset.pixelHeight;
		expect(image.bounds.w / image.bounds.h).toBeCloseTo(sourceRatio, 6);
		expect(image.altText).toBe("신안 해상풍력 파노라마");
		expect(image.provenance).toEqual(asset.provenance);
		expect(image.path).toBe(asset.path);
	});

	test("falls back to a native caption block when the asset is missing", () => {
		const fallback = buildImageCalloutPlan({
			asset: undefined,
			alt: "신안 해상풍력 파노라마",
			caption: "신안 해상풍력 단지 전경",
			fallbackReason: "asset-missing",
		});
		expect(fallback.kind).toBe("image-callout");
		expect(fallback.fallback).toEqual({ applied: true, reason: "asset-missing", code: "KCH-W-RENDER-ASSET" });
		expect(objectsOfKind(fallback, "image")).toHaveLength(0);
		expectNativePlan(fallback);
		expect(texts(fallback).map((text) => text.text)).toContain("신안 해상풍력 단지 전경");
	});

	test("rejects an asset with non-positive pixel dimensions", () => {
		try {
			buildImageCalloutPlan({
				asset: { ...asset, pixelHeight: 0 },
				alt: "잘못된 자산",
				caption: "잘못된 자산",
			});
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-ASSET");
		}
	});
});
