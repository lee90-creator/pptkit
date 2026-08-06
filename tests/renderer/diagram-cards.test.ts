import { describe, expect, test } from "bun:test";

import {
	type DiagramRenderError,
	buildComparisonCardsPlan,
	buildStrategyCardsPlan,
} from "../../src/renderer/diagrams.js";
import { EPSILON, boundsOf, expectNativePlan, shapes } from "./diagram-test-helpers.js";

describe("strategy and comparison cards", () => {
	test("lays strategy cards on one row without overlap", () => {
		const plan = buildStrategyCardsPlan({
			cards: [
				{ id: "c1", title: "성장", body: "해상풍력 EPC 확대" },
				{ id: "c2", title: "수익", body: "O&M 장기 계약" },
				{ id: "c3", title: "안정", body: "PF 조기상환 관리" },
			],
		});
		expect(plan.kind).toBe("strategy-cards");
		expectNativePlan(plan);
		const cards = shapes(plan).filter((shape) => shape.shapeName === "roundRect");
		expect(cards).toHaveLength(3);
		expect(cards.map((card) => card.id)).toEqual(["card-c1", "card-c2", "card-c3"]);
		expect(cards.every((card) => card.bounds.h > 3.5)).toBe(true);
		for (let index = 1; index < cards.length; index += 1) {
			const previous = cards[index - 1];
			const current = cards[index];
			if (!previous || !current) {
				throw new Error("missing card");
			}
			expect(current.bounds.x).toBeGreaterThanOrEqual(previous.bounds.x + previous.bounds.w - EPSILON);
		}
	});

	test("renders comparison cards as two contrasted columns", () => {
		const plan = buildComparisonCardsPlan({
			left: { id: "as-is", title: "현행", points: ["개별 발주", "높은 금융비용"] },
			right: { id: "to-be", title: "개선", points: ["통합 발주", "PF 구조 최적화"] },
		});
		expect(plan.kind).toBe("comparison-cards");
		expectNativePlan(plan);
		const left = boundsOf(plan, "card-as-is");
		const right = boundsOf(plan, "card-to-be");
		expect(right.x).toBeGreaterThanOrEqual(left.x + left.w - EPSILON);
		expect(left.w).toBeCloseTo(right.w, 10);
		expect(left.h).toBeGreaterThan(4);
	});

	test("rejects more strategy cards than the layout supports", () => {
		try {
			buildStrategyCardsPlan({
				cards: Array.from({ length: 6 }, (_value, index) => ({
					id: `c${index}`,
					title: `전략 ${index}`,
					body: "본문",
				})),
			});
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CAPACITY");
		}
	});
});
