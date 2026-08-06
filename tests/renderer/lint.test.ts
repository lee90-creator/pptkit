import { describe, expect, test } from "bun:test";

import { type PlannedObject, type SlideLintInput, lintDeck } from "../../src/lint/report.js";

function object(overrides: Partial<PlannedObject> = {}): PlannedObject {
	return {
		id: "object-1",
		kind: "shape",
		nativeObject: "shape",
		bounds: { x: 1, y: 1.5, width: 2, height: 1 },
		role: "body",
		collisionGroup: "body",
		...overrides,
	};
}

function slide(objects: readonly PlannedObject[]): SlideLintInput {
	return {
		slideId: "slide-1",
		width: 13.333333333333334,
		height: 7.5,
		headerSkin: "kch-framed-right",
		objects,
	};
}

describe("renderer structural lint", () => {
	test("passes a clean native corporate slide without false positives", () => {
		const result = lintDeck([
			slide([
				object({ id: "header", role: "header-title", collisionGroup: "header" }),
				object({ id: "logo", kind: "image", nativeObject: "image", role: "logo", collisionGroup: "logo" }),
				object({ id: "body", bounds: { x: 1, y: 2.5, width: 4, height: 2 } }),
			]),
		]);
		expect(result.blockers).toEqual([]);
	});

	test("detects every seeded blocker with located rules", () => {
		const result = lintDeck([
			slide([
				object({ id: "outside", bounds: { x: 12.5, y: 2, width: 2, height: 1 } }),
				object({ id: "overlap-a", bounds: { x: 1, y: 3, width: 3, height: 2 } }),
				object({ id: "overlap-b", bounds: { x: 2, y: 3.5, width: 3, height: 2 } }),
				object({
					id: "font",
					kind: "text",
					nativeObject: "shape",
					fontFace: "Mont Blanc",
					fontSize: 8,
				}),
				object({ id: "raster-table", kind: "table", nativeObject: "image" }),
				object({ id: "empty-chart", kind: "chart", nativeObject: "chart", dataCount: 0 }),
			]),
		]);
		expect(new Set(result.blockers.map((issue) => issue.rule))).toEqual(
			new Set(["bounds", "overlap", "font-family", "font-size", "native-object", "empty-data", "header-presence"]),
		);
		expect(result.blockers.every((issue) => issue.slideId === "slide-1" && issue.objectId.length > 0)).toBe(true);
	});

	test("allows explicit frame bleed and panorama/header overlap groups", () => {
		const result = lintDeck([
			{
				...slide([]),
				headerSkin: "shinan-line-left",
				objects: [
					object({
						id: "frame",
						bounds: { x: 8, y: -0.04, width: 5.4, height: 0.12 },
						role: "header-frame",
						collisionGroup: "frame",
						allowBleed: true,
					}),
					object({ id: "header", role: "header-title", collisionGroup: "header" }),
					object({
						id: "logo",
						kind: "image",
						nativeObject: "image",
						role: "logo",
						collisionGroup: "logo",
					}),
					object({
						id: "panorama",
						kind: "image",
						nativeObject: "image",
						role: "panorama",
						bounds: { x: 0, y: 6.833, width: 13.333, height: 0.667 },
						collisionGroup: "panorama",
					}),
				],
			},
		]);
		expect(result.blockers).toEqual([]);
	});
});
