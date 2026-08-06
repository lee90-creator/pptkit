import { describe, expect, test } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { buildClosingPlan, buildCoverPlan, buildSectionDividerPlan } from "../../src/renderer/diagrams.js";
import { expectNativePlan, objectsOfKind, texts } from "./diagram-test-helpers.js";

describe("cover, section divider and closing", () => {
	test("cover uses display type above the body minimum", () => {
		const plan = buildCoverPlan({
			title: "KCH그룹 소개자료",
			subtitle: "2026년 사업 현황",
			footnote: "낸부 자료",
		});
		expect(plan.kind).toBe("cover");
		expectNativePlan(plan);
		const title = texts(plan).find((text) => text.id === "cover-title");
		expect(title?.fontFace).toBe(KCH_TOKENS.fonts.display);
		expect(title?.fontSize).toBeGreaterThan(KCH_TOKENS.fontSizes.header);
		const footnote = texts(plan).find((text) => text.id === "cover-footnote");
		expect(footnote?.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.footnoteMinimum);
		expect(texts(plan).map((text) => text.text)).toContain("KCH\nGROUP");
	});

	test("section divider carries the section number and title", () => {
		const plan = buildSectionDividerPlan({ sectionNumber: "03", title: "사업 추진 현황" });
		expect(plan.kind).toBe("section-divider");
		expectNativePlan(plan);
		expect(texts(plan).map((text) => text.text)).toContain("03");
		expect(texts(plan).map((text) => text.text)).toContain("사업 추진 현황");
		expect(texts(plan).map((text) => text.text)).toContain("03");
	});

	test("closing renders a native message without images", () => {
		const plan = buildClosingPlan({ message: "감사합니다", contact: "kch@example.com" });
		expect(plan.kind).toBe("closing");
		expectNativePlan(plan);
		expect(objectsOfKind(plan, "image")).toHaveLength(0);
		expect(objectsOfKind(plan, "shape").some((shape) => shape.id === "closing-panel")).toBe(false);
	});
});
