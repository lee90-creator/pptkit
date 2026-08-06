import { describe, expect, test } from "bun:test";

import { CapacityError } from "../../src/design-system/capacity.js";
import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { planFinancialDashboard, planKpiCards, renderFinancialDashboard } from "../../src/renderer/metrics.js";
import { KPI_CARDS, chartInput, expectWithinCanvas, slideXml } from "./data-visual-helpers.js";

describe("native editable metrics", () => {
	test("lays out KPI cards as native shapes with minimum body typography", () => {
		const decision = planKpiCards({ cards: KPI_CARDS.map((card) => ({ ...card })) });
		if (decision.status !== "render") {
			throw new Error(`Expected render decision, received ${decision.status}`);
		}
		const plan = decision.plan;
		expect(plan.cards).toHaveLength(KPI_CARDS.length);
		for (const card of plan.cards) {
			expect(card.nativeObject).toBe("shape");
			expect(card.labelFontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.bodyMinimum);
			expect(card.valueFontFace).toBe(KCH_TOKENS.fonts.display);
			expectWithinCanvas(card.bounds);
		}
		expect(plan.cards.map((card) => card.valueText)).toEqual(["1,284억원", "46기", "312명"]);
		expect(plan.bounds.height).toBeGreaterThan(3);
		const gaps = plan.cards.slice(1).map((card, index) => {
			const previous = plan.cards[index];
			if (!previous) {
				throw new Error("Missing preceding KPI card");
			}
			return Number((card.bounds.x - (previous.bounds.x + previous.bounds.width)).toFixed(6));
		});
		expect(new Set(gaps).size).toBe(1);
	});

	test("combines KPI cards and a native chart into a financial dashboard", () => {
		const decision = planFinancialDashboard({
			cards: KPI_CARDS.map((card) => ({ ...card })),
			chart: chartInput("bar"),
		});
		if (decision.status !== "render") {
			throw new Error(`Expected render decision, received ${decision.status}`);
		}
		const plan = decision.plan;
		expect(plan.cards.cards).toHaveLength(KPI_CARDS.length);
		expect(plan.chart.nativeObject).toBe("chart");
		expect(plan.chart.series).toHaveLength(2);
		expectWithinCanvas(plan.chart.bounds);
		const lastCard = plan.cards.cards[plan.cards.cards.length - 1];
		if (!lastCard) {
			throw new Error("Missing KPI card");
		}
		expect(plan.chart.bounds.y).toBeGreaterThanOrEqual(lastCard.bounds.y + lastCard.bounds.height);
	});

	test("writes KPI cards and dashboard charts as native shapes and charts", async () => {
		const decision = planFinancialDashboard({
			cards: KPI_CARDS.map((card) => ({ ...card })),
			chart: chartInput("line"),
		});
		if (decision.status !== "render") {
			throw new Error("Expected render decision");
		}
		const { slide, charts } = await slideXml((target) => {
			renderFinancialDashboard(target, decision.plan);
		});
		expect(charts).toHaveLength(1);
		expect(charts[0]).toContain("<c:lineChart>");
		expect(slide).toContain("1,284억원");
		expect(slide).not.toContain("2026년 기준");
		expect(slide).toContain(KCH_TOKENS.fonts.display);
		expect(slide).not.toContain("<p:pic>");
	});

	test("returns a deterministic split when KPI cards exceed one row", () => {
		const cards = Array.from({ length: 11 }, (_, index) => ({
			label: `지표 ${index + 1}`,
			value: index * 7,
			unit: "건",
		}));
		expect(planKpiCards({ cards })).toEqual({ status: "split", chunks: 3 });
	});

	test("rejects a KPI card label that cannot shrink below the minimum font", () => {
		expect(() =>
			planKpiCards({
				cards: [{ label: "가".repeat(120), value: 1, unit: "건" }],
			}),
		).toThrow(CapacityError);
	});
});
