import { describe, expect, test } from "bun:test";

import { DiagramRenderError } from "../../src/renderer/diagrams.js";
import { buildTimelinePlan } from "../../src/renderer/timeline.js";
import { connectors, expectConnectedEndpoints, expectNativePlan, shapes, texts } from "./diagram-test-helpers.js";

describe("timeline", () => {
	test("places milestones on a single connected axis", () => {
		const plan = buildTimelinePlan({
			events: [
				{ date: "2024-03", label: "사업 승인", detail: "이사회 의결 완료" },
				{ date: "2025-01", label: "착공" },
				{ date: "2026-06", label: "상업 운전" },
			],
		});
		expect(plan.kind).toBe("timeline");
		expectNativePlan(plan);
		expectConnectedEndpoints(plan);
		expect(texts(plan).map((text) => text.text)).toContain("이사회 의결 완료");
		const axis = plan.objects.find((item) => item.id === "axis");
		expect(axis?.object).toBe("shape");
		for (const [index, connector] of connectors(plan).entries()) {
			expect(connector.fromId).toBe(`marker-${index}`);
			expect(connector.toId).toBe(`label-block-${index}`);
			expect(connector.endArrowType).toBe("none");
		}
	});

	test("orders milestone markers left to right in the given event order", () => {
		const plan = buildTimelinePlan({
			events: [
				{ date: "2024-03", label: "사업 승인" },
				{ date: "2025-01", label: "착공" },
				{ date: "2026-06", label: "상업 운전" },
			],
		});
		const markers = shapes(plan).filter((shape) => shape.id.startsWith("marker-"));
		expect(markers.map((marker) => marker.id)).toEqual(["marker-0", "marker-1", "marker-2"]);
		const xs = markers.map((marker) => marker.bounds.x);
		expect(xs).toEqual([...xs].sort((a, b) => a - b));
	});

	test("returns a deterministic capacity error when over capacity", () => {
		const events = Array.from({ length: 14 }, (_value, index) => ({
			date: `20${30 + index}-01`,
			label: `이정표 ${index + 1}`,
		}));
		try {
			buildTimelinePlan({ events });
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect(error).toBeInstanceOf(DiagramRenderError);
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CAPACITY");
		}
	});
});
