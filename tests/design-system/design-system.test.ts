import { describe, expect, test } from "bun:test";
import type PptxGenJS from "pptxgenjs";

import kchGeometry from "../../reference/geometry/kch-framed-right.json";
import shinanGeometry from "../../reference/geometry/shinan-line-left.json";
import { resolveCapacity } from "../../src/design-system/capacity.js";
import {
	DesignSystemError,
	buildHeaderSkin,
	parseHeaderSkin,
	renderHeaderSkin,
} from "../../src/design-system/header-skins.js";
import { resolveHeaderSkin, resolvePanorama } from "../../src/design-system/modes.js";
import { KCH_TOKENS, assertAllowedFont } from "../../src/design-system/tokens.js";

const POINTS_PER_INCH = 72;
const TOLERANCE_POINTS = 0.05;

function expectAnchor(
	actual: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
	expected: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): void {
	expect(Math.abs(actual.x * POINTS_PER_INCH - expected.x)).toBeLessThanOrEqual(TOLERANCE_POINTS);
	expect(Math.abs(actual.y * POINTS_PER_INCH - expected.y)).toBeLessThanOrEqual(TOLERANCE_POINTS);
	expect(Math.abs(actual.width * POINTS_PER_INCH - expected.width)).toBeLessThanOrEqual(TOLERANCE_POINTS);
	expect(Math.abs(actual.height * POINTS_PER_INCH - expected.height)).toBeLessThanOrEqual(TOLERANCE_POINTS);
}

function requireAnchor(
	anchors: Record<string, { readonly x: number; readonly y: number; readonly width: number; readonly height: number }>,
	id: string,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
	const anchor = anchors[id];
	if (!anchor) {
		throw new Error(`Missing header anchor: ${id}`);
	}
	return anchor;
}

describe("KCH reference design system", () => {
	test("maps each document mode and explicit override exhaustively", () => {
		expect(resolveHeaderSkin("corporate")).toBe("kch-framed-right");
		expect(resolveHeaderSkin("wind-industrial")).toBe("shinan-line-left");
		expect(resolveHeaderSkin("corporate", "shinan-line-left")).toBe("shinan-line-left");
		expect(resolveHeaderSkin("wind-industrial", "kch-framed-right")).toBe("kch-framed-right");
	});

	test("matches framed-right literal reference anchors", () => {
		const skin = buildHeaderSkin({
			skin: "kch-framed-right",
			title: "그룹 현황",
			sectionNumber: "01",
			usePanorama: false,
		});
		const anchors = Object.fromEntries(skin.elements.map((element) => [element.id, element.bounds]));
		expectAnchor(requireAnchor(anchors, "rightFrame"), kchGeometry.anchors.rightFrame);
		expectAnchor(requireAnchor(anchors, "topRule"), kchGeometry.anchors.topRule);
		expectAnchor(requireAnchor(anchors, "verticalBand"), kchGeometry.anchors.verticalBand);
		expectAnchor(requireAnchor(anchors, "sectionNumber"), kchGeometry.anchors.sectionNumber);
		expectAnchor(requireAnchor(anchors, "title"), kchGeometry.anchors.title);
		expectAnchor(requireAnchor(anchors, "logo"), kchGeometry.anchors.logo);
		expect(skin.elements.every((element) => element.nativeObject === "shape" || element.nativeObject === "image")).toBe(
			true,
		);
	});

	test("renders one intact logo and keeps the right rule inside the full canvas", () => {
		const texts: string[] = [];
		const shapes: Array<{ readonly y: number; readonly h: number; readonly objectName?: string }> = [];
		const images: Array<{ readonly w: number; readonly objectName?: string }> = [];
		const slide = {
			addText: (text: string) => texts.push(text),
			addShape: (_shape: string, options: { y: number; h: number; objectName?: string }) => shapes.push(options),
			addImage: (options: { w: number; objectName?: string }) => images.push(options),
		} as unknown as PptxGenJS.PresSlide;
		renderHeaderSkin(
			slide,
			buildHeaderSkin({
				skin: "kch-framed-right",
				title: "그룹 현황",
				sectionNumber: "02",
				pageNumber: "05",
				usePanorama: false,
			}),
			{ logoPath: "logo.png", brandLockupPath: "logo.png" },
		);
		expect(texts).toEqual(["02", "그룹 현황", "KCH그룹 소개", "05"]);
		expect(images).toHaveLength(1);
		expect(images[0]?.w).toBeLessThan(1);
		const rightRule = shapes.find((shape) => shape.objectName === "KCH-rightFrame-right");
		expect(rightRule?.y).toBe(0);
		expect((rightRule?.y ?? 0) + (rightRule?.h ?? 0)).toBeLessThanOrEqual(KCH_TOKENS.canvas.height);
	});

	test("matches line-left literal reference anchors and wind panorama", () => {
		const skin = buildHeaderSkin({
			skin: "shinan-line-left",
			title: "사업 추진 현황",
			usePanorama: true,
		});
		const anchors = Object.fromEntries(skin.elements.map((element) => [element.id, element.bounds]));
		expectAnchor(requireAnchor(anchors, "brandLockup"), shinanGeometry.anchors.brandLockup);
		expectAnchor(requireAnchor(anchors, "topRule"), shinanGeometry.anchors.topRule);
		expectAnchor(requireAnchor(anchors, "title"), shinanGeometry.anchors.title);
		expectAnchor(requireAnchor(anchors, "panorama"), shinanGeometry.anchors.panorama);
	});

	test("uses Pretendard roles and rejects every forbidden reference font", () => {
		expect(KCH_TOKENS.fonts).toEqual({
			display: "Pretendard Black",
			heading: "Pretendard Bold",
			body: "Pretendard Regular",
		});
		for (const font of Object.values(KCH_TOKENS.fonts)) {
			expect(assertAllowedFont(font)).toBe(font);
		}
		for (const forbidden of ["Mont", "Mont Blanc", "NanumSquare", "Tmon", "Omni Gothic", "Inter"]) {
			expect(() => assertAllowedFont(forbidden)).toThrow(DesignSystemError);
		}
	});

	test("rejects corporate panorama and averaged header fixtures", () => {
		expect(resolvePanorama("corporate", false)).toBe(false);
		expect(resolvePanorama("wind-industrial", true)).toBe(true);
		expect(() => resolvePanorama("corporate", true)).toThrow("KCH-E-DESIGN-PANORAMA");
		expect(() => parseHeaderSkin("averaged-header")).toThrow("KCH-E-DESIGN-HEADER");
	});

	test("keeps capacity order wrap then alternate then split then Korean error", () => {
		expect(
			resolveCapacity({
				kind: "text",
				characterCount: 800,
				maxUnbrokenCharacters: 30,
				itemCount: 8,
				splittable: true,
			}),
		).toEqual({ action: "wrap" });
		expect(
			resolveCapacity({
				kind: "table",
				characterCount: 1_000,
				maxUnbrokenCharacters: 60,
				itemCount: 16,
				splittable: true,
			}),
		).toEqual({ action: "alternate-layout", layout: "table-landscape" });
		expect(
			resolveCapacity({
				kind: "text",
				characterCount: 1_400,
				maxUnbrokenCharacters: 30,
				itemCount: 14,
				splittable: true,
			}),
		).toEqual({ action: "split", chunks: 2 });
		expect(() =>
			resolveCapacity({
				kind: "text",
				characterCount: 1_400,
				maxUnbrokenCharacters: 120,
				itemCount: 1,
				splittable: false,
			}),
		).toThrow("콘텐츠가 슬라이드 수용 한계를 초과");
	});
});
