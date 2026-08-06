import { describe, expect, test } from "bun:test";

import { DiagramRenderError } from "../../src/renderer/diagrams.js";
import { buildGanttPlan } from "../../src/renderer/gantt.js";
import { expectNativePlan, shapes } from "./diagram-test-helpers.js";

describe("mini gantt", () => {
	test("renders one native bar per task inside the plotted window", () => {
		const plan = buildGanttPlan({
			periods: ["1Q", "2Q", "3Q", "4Q"],
			tasks: [
				{ id: "t1", label: "설계", startIndex: 0, spanCount: 2 },
				{ id: "t2", label: "조달", startIndex: 1, spanCount: 2 },
				{ id: "t3", label: "시공", startIndex: 2, spanCount: 2 },
			],
		});
		expect(plan.kind).toBe("mini-gantt");
		expectNativePlan(plan);
		const bars = shapes(plan).filter((shape) => shape.id.startsWith("bar-"));
		expect(bars).toHaveLength(3);
		const firstBar = bars[0];
		const secondBar = bars[1];
		expect(firstBar).toBeDefined();
		expect(secondBar).toBeDefined();
		if (!firstBar || !secondBar) {
			throw new Error("missing bars");
		}
		expect(secondBar.bounds.x).toBeGreaterThan(firstBar.bounds.x);
		expect(firstBar.bounds.w).toBeCloseTo(secondBar.bounds.w, 10);
		const terminal = shapes(plan).find((shape) => shape.id === "gridline-end");
		expect(terminal).toBeDefined();
		expect(Math.max(...bars.map((bar) => bar.bounds.x + bar.bounds.w))).toBeLessThanOrEqual(terminal?.bounds.x ?? 0);
	});

	test("rejects a task span that runs past the last period", () => {
		try {
			buildGanttPlan({
				periods: ["1Q", "2Q"],
				tasks: [{ id: "t1", label: "설계", startIndex: 1, spanCount: 3 }],
			});
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-BOUNDS");
		}
	});
});
