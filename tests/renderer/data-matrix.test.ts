import { describe, expect, test } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { RendererError } from "../../src/renderer/charts.js";
import { planMatrix, renderMatrix } from "../../src/renderer/matrix.js";
import { MATRIX_INPUT, expectWithinCanvas, slideXml } from "./data-visual-helpers.js";

describe("native editable matrix and heatmap", () => {
	test("renders a matrix as an editable table with deterministic heat fills", () => {
		const decision = planMatrix(MATRIX_INPUT);
		if (decision.status !== "render") {
			throw new Error(`Expected render decision, received ${decision.status}`);
		}
		const plan = decision.plan;
		expect(plan.nativeObject).toBe("table");
		expect(plan.rows).toHaveLength(MATRIX_INPUT.rowLabels.length + 1);
		expect(plan.rows[0]?.map((cell) => cell.text)).toEqual(["구분", "1분기", "2분기", "3분기"]);
		expect(plan.rows[1]?.[1]?.text).toBe("92점");
		expect(plan.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.tableMinimum);
		expectWithinCanvas(plan.bounds);
		const hottest = plan.rows[1]?.[3]?.fill;
		const coldest = plan.rows[3]?.[1]?.fill;
		expect(hottest).toBe(KCH_TOKENS.colors.navy);
		expect(coldest).toBe(KCH_TOKENS.colors.sectionNumber);
		expect(plan.rows[1]?.[3]?.color).toBe(KCH_TOKENS.colors.background);
		expect(plan.rows[3]?.[1]?.color).toBe(KCH_TOKENS.colors.body);
		expect(plan.rows[1]?.[0]?.fill).toBe(KCH_TOKENS.colors.sectionNumber);
	});

	test("writes the heatmap as a native OOXML table", async () => {
		const decision = planMatrix(MATRIX_INPUT);
		if (decision.status !== "render") {
			throw new Error("Expected render decision");
		}
		const { slide } = await slideXml((target) => {
			renderMatrix(target, decision.plan);
		});
		expect(slide).toContain("<a:tbl>");
		expect(slide).toContain("92점");
		expect(slide).not.toContain("<p:pic>");
	});

	test("rejects ragged matrix data and over-capacity grids deterministically", () => {
		expect(() =>
			planMatrix({
				rowLabels: ["안전", "품질"],
				columnLabels: ["1분기", "2분기"],
				values: [[1, 2], [3]],
				unit: "점",
			}),
		).toThrow(RendererError);
		const rowLabels = Array.from({ length: 22 }, (_, index) => `평가 항목 ${index + 1}`);
		expect(
			planMatrix({
				rowLabels,
				columnLabels: ["1분기", "2분기", "3분기"],
				values: rowLabels.map((_, row) => [row, row + 1, row + 2]),
				unit: "점",
			}),
		).toEqual({ status: "split", chunks: 3 });
	});
});
