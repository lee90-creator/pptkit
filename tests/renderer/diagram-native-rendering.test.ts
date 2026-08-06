import { describe, expect, test } from "bun:test";

import { buildOrgChartPlan, renderPlan } from "../../src/renderer/diagrams.js";
import { buildImageCalloutPlan } from "../../src/renderer/image-callout.js";
import { ORG_CHART_INPUT, createSlideRecorder } from "./diagram-test-helpers.js";

describe("native rendering", () => {
	test("emits only native shape, text, image and connector calls in z-order", () => {
		const plan = buildOrgChartPlan(ORG_CHART_INPUT);
		const recorder = createSlideRecorder();
		renderPlan(recorder.slide, plan);
		expect(recorder.calls.length).toBe(plan.objects.length);
		for (const [index, call] of recorder.calls.entries()) {
			const planned = plan.objects[index];
			if (!planned) {
				throw new Error("plan/call length mismatch");
			}
			expect(call.options.objectName).toBe(`KCH-${planned.id}`);
			if (planned.object === "text") {
				expect(call.method).toBe("addText");
				continue;
			}
			if (planned.object === "image") {
				expect(call.method).toBe("addImage");
				continue;
			}
			expect(call.method).toBe("addShape");
			expect(call.shapeName).toBe(planned.shapeName);
		}
		expect(recorder.calls.some((call) => call.shapeName === "line")).toBe(true);
	});

	test("renders the image callout through the native image API", () => {
		const plan = buildImageCalloutPlan({
			asset: {
				assetId: "wordmark",
				path: "assets/logos/KCH_LOGOV2.png",
				pixelWidth: 458,
				pixelHeight: 246,
				provenance: { source: "provided", identifier: "logo/KCH_LOGOV2.png", licenseStatus: "internal-use-only" },
			},
			alt: "KCH 워드마크",
			caption: "KCH 그룹 아이덴티티",
		});
		const recorder = createSlideRecorder();
		renderPlan(recorder.slide, plan);
		const imageCalls = recorder.calls.filter((call) => call.method === "addImage");
		expect(imageCalls).toHaveLength(1);
		const imageCall = imageCalls[0];
		if (!imageCall) {
			throw new Error("missing image call");
		}
		expect(imageCall.options.path).toBe("assets/logos/KCH_LOGOV2.png");
		expect(imageCall.options.altText).toBe("KCH 워드마크");
	});
});
