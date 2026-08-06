import { describe, expect, test } from "bun:test";

import { type DiagramRenderError, buildHubSpokePlan } from "../../src/renderer/diagrams.js";
import { boundsOf, connectors, expectConnectedEndpoints, expectNativePlan } from "./diagram-test-helpers.js";

describe("hub and spoke", () => {
	test("connects every spoke to the hub without decorative arrows", () => {
		const plan = buildHubSpokePlan({
			hub: { id: "hub", label: "통합 플랫폼" },
			spokes: [
				{ id: "s1", label: "해상풍력" },
				{ id: "s2", label: "전력변환" },
				{ id: "s3", label: "O&M" },
				{ id: "s4", label: "금융" },
				{ id: "s5", label: "EPC" },
			],
		});
		expect(plan.kind).toBe("hub-spoke");
		expectNativePlan(plan);
		expectConnectedEndpoints(plan);
		expect(connectors(plan)).toHaveLength(5);
		for (const connector of connectors(plan)) {
			expect(connector.fromId).toBe("hub");
		}
	});

	test("routes each connector along its dominant axis instead of a decorative diagonal", () => {
		const plan = buildHubSpokePlan({
			hub: { id: "hub", label: "통합 플랫폼" },
			spokes: [
				{ id: "north", label: "북" },
				{ id: "east", label: "동" },
				{ id: "south", label: "남" },
				{ id: "west", label: "서" },
			],
		});
		for (const connector of connectors(plan)) {
			const horizontal = Math.abs(connector.end.x - connector.start.x);
			const vertical = Math.abs(connector.end.y - connector.start.y);
			const spoke = boundsOf(plan, connector.toId);
			const hub = boundsOf(plan, "hub");
			const spokeIsHorizontal =
				Math.abs(spoke.x + spoke.w / 2 - (hub.x + hub.w / 2)) >= Math.abs(spoke.y + spoke.h / 2 - (hub.y + hub.h / 2));
			expect(spokeIsHorizontal ? horizontal >= vertical : vertical >= horizontal).toBe(true);
		}
	});

	test("refuses a hub with no spokes", () => {
		try {
			buildHubSpokePlan({ hub: { id: "hub", label: "허브" }, spokes: [] });
			throw new Error("expected DiagramRenderError");
		} catch (error) {
			expect((error as DiagramRenderError).code).toBe("KCH-E-RENDER-CONNECTOR");
		}
	});
});
