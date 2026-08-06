import { describe, expect, test } from "bun:test";

import { DiagramRenderError } from "../../src/renderer/diagrams.js";
import { buildProcessPlan } from "../../src/renderer/process.js";
import { connectors, expectConnectedEndpoints, expectNativePlan, shapes, texts } from "./diagram-test-helpers.js";

describe("process", () => {
	test("chains chevrons with connected step-to-step endpoints", () => {
		const plan = buildProcessPlan({
			steps: [
				{ id: "s1", label: "타당성 검토" },
				{ id: "s2", label: "인허가" },
				{ id: "s3", label: "시공" },
				{ id: "s4", label: "운영" },
			],
		});
		expect(plan.kind).toBe("process");
		expectNativePlan(plan);
		expectConnectedEndpoints(plan);
		expect(connectors(plan)).toHaveLength(3);
		expect(shapes(plan)).toHaveLength(4);
		for (const shape of shapes(plan)) {
			expect(shape.shapeName).toBe("chevron");
			expect(shape.bounds.h).toBeGreaterThan(4);
		}
		for (const [index, label] of texts(plan)
			.filter((text) => text.id.endsWith("-label"))
			.entries()) {
			const shape = shapes(plan)[index];
			if (!shape) throw new Error("missing process chevron");
			expect(label.bounds.x).toBeGreaterThanOrEqual(shape.bounds.x + shape.bounds.w * 0.2);
			expect(label.bounds.x + label.bounds.w).toBeLessThanOrEqual(shape.bounds.x + shape.bounds.w * 0.8);
			if (index === 3) expect(label.bounds.x).toBeGreaterThanOrEqual(shape.bounds.x + shape.bounds.w * 0.35);
		}
	});

	test("returns a capacity fallback instead of shrinking below the body minimum", () => {
		const steps = Array.from({ length: 12 }, (_value, index) => ({
			id: `s${index + 1}`,
			label: `단계 ${index + 1}`,
		}));
		try {
			buildProcessPlan({ steps });
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CAPACITY");
			expect((error as DiagramRenderError).message).toContain("단계");
		}
	});
});
