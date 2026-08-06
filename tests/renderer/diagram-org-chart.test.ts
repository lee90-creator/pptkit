import { describe, expect, test } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { DiagramRenderError, buildOrgChartPlan } from "../../src/renderer/diagrams.js";
import {
	ORG_CHART_INPUT,
	connectors,
	expectConnectedEndpoints,
	expectNativePlan,
	shapes,
	texts,
} from "./diagram-test-helpers.js";

describe("org chart", () => {
	test("renders native shapes with connected parent-child endpoints", () => {
		const plan = buildOrgChartPlan(ORG_CHART_INPUT);
		expect(plan.kind).toBe("org-chart");
		expectNativePlan(plan);
		expectConnectedEndpoints(plan);
		expect(connectors(plan)).toHaveLength(3);
		expect(shapes(plan)).toHaveLength(4);
		for (const connector of connectors(plan)) {
			expect(connector.shapeName).toBe("line");
			expect(connector.endArrowType).toBe("triangle");
		}
	});

	test("keeps every node label at or above the body minimum font", () => {
		const plan = buildOrgChartPlan(ORG_CHART_INPUT);
		for (const text of texts(plan)) {
			expect(text.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.bodyMinimum);
		}
	});

	test("rejects an edge whose endpoint is not a declared node", () => {
		expect(() =>
			buildOrgChartPlan({
				nodes: [{ id: "root", label: "회장" }],
				edges: [{ from: "root", to: "ghost" }],
			}),
		).toThrow(DiagramRenderError);
		try {
			buildOrgChartPlan({
				nodes: [{ id: "root", label: "회장" }],
				edges: [{ from: "root", to: "ghost" }],
			});
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CONNECTOR");
		}
	});

	test("rejects a forest without a single root", () => {
		try {
			buildOrgChartPlan({
				nodes: [
					{ id: "a", label: "A" },
					{ id: "b", label: "B" },
				],
				edges: [],
			});
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CONNECTOR");
		}
	});
});
