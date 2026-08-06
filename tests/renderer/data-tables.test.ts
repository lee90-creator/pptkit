import { describe, expect, test } from "bun:test";

import { CapacityError } from "../../src/design-system/capacity.js";
import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { planTable, renderTable } from "../../src/renderer/tables.js";
import { SPEC_ROWS, expectWithinCanvas, slideXml, tableInput } from "./data-visual-helpers.js";

describe("native editable tables", () => {
	test("builds data and specification tables with header plus every source row", () => {
		for (const variant of ["data", "specification"] as const) {
			const decision = planTable(tableInput(variant));
			if (decision.status !== "render") {
				throw new Error(`Expected render decision, received ${decision.status}`);
			}
			const plan = decision.plan;
			expect(plan.nativeObject).toBe("table");
			expect(plan.rows).toHaveLength(SPEC_ROWS.length + 1);
			expect(plan.rows[0]?.map((cell) => cell.text)).toEqual(["항목", "값 (MW)", "출처"]);
			expect(plan.rows[1]?.map((cell) => cell.text)).toEqual(["정격 출력", "5.56 MW", "제조사 사양서"]);
			expect(plan.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.tableMinimum);
			expect(plan.rowHeight).toBeLessThanOrEqual(0.72);
			expect(plan.bounds.height).toBeCloseTo(plan.rowHeight * plan.rows.length, 6);
			expect(plan.rows.every((row) => row.every((cell) => cell.fontFace === KCH_TOKENS.fonts.body))).toBe(true);
			expectWithinCanvas(plan.bounds);
			expect(plan.columnWidths.reduce((total, width) => total + width, 0)).toBeCloseTo(plan.bounds.width, 6);
		}
	});

	test("distinguishes specification tables by a labelled first column", () => {
		const data = planTable(tableInput("data"));
		const specification = planTable(tableInput("specification"));
		if (data.status !== "render" || specification.status !== "render") {
			throw new Error("Expected render decisions for both table variants");
		}
		expect(specification.plan.columnWidths[0]).toBeGreaterThan(data.plan.columnWidths[0] ?? 0);
		expect(specification.plan.rows[1]?.[0]?.bold).toBe(true);
		expect(data.plan.rows[1]?.[0]?.bold).toBe(false);
	});

	test("writes a native OOXML table with header fill and no rasterization", async () => {
		const decision = planTable(tableInput("data"));
		if (decision.status !== "render") {
			throw new Error("Expected render decision");
		}
		const { slide } = await slideXml((target) => {
			renderTable(target, decision.plan);
		});
		expect(slide).toContain("http://schemas.openxmlformats.org/drawingml/2006/table");
		expect(slide).toContain("<a:tbl>");
		expect(slide).toContain(KCH_TOKENS.colors.navy);
		expect(slide).not.toContain("<p:pic>");
		expect([...slide.matchAll(/<a:tr /g)]).toHaveLength(SPEC_ROWS.length + 1);
	});

	test("returns the landscape alternate layout before dropping table rows", () => {
		const rows = Array.from({ length: 16 }, (_, index) => ({
			cells: [`설비 ${index + 1}`, `${index * 3} MW`, "제조사 사양서 기준 상세 항목 설명 문장"],
		}));
		expect(planTable({ variant: "data", columns: ["설비", "용량", "비고"], rows })).toEqual({
			status: "alternate-layout",
			layout: "table-landscape",
		});
	});

	test("splits an oversized table and raises the Korean capacity error when unsplittable", () => {
		const rows = Array.from({ length: 26 }, (_, index) => ({
			cells: [`설비 ${index + 1}`, `${index * 3} MW`, "제조사 사양서 기준 상세 항목"],
		}));
		expect(planTable({ variant: "data", columns: ["설비", "용량", "비고"], rows })).toEqual({
			status: "split",
			chunks: 3,
		});
		expect(() =>
			planTable({
				variant: "specification",
				columns: ["항목", "설명"],
				rows: [{ cells: ["항목", "가".repeat(1_300)] }],
			}),
		).toThrow(CapacityError);
	});
});
