import { describe, expect, test } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import {
	CONTENT_REGION,
	RendererError,
	assertWithinContent,
	planChart,
	renderChart,
} from "../../src/renderer/charts.js";
import {
	CANVAS,
	EMU_PER_INCH,
	chartInput,
	expectWithinCanvas,
	graphicFrameOffsets,
	renderedChartPlan,
	slideXml,
} from "./data-visual-helpers.js";

describe("native editable charts", () => {
	test("maps every supported chart type onto native PptxGenJS chart objects", () => {
		expect(renderedChartPlan("bar").pptxType).toBe("bar");
		expect(renderedChartPlan("line").pptxType).toBe("line");
		expect(renderedChartPlan("area").pptxType).toBe("area");
		expect(renderedChartPlan("donut").pptxType).toBe("doughnut");
		for (const chartType of ["bar", "line", "area", "donut"] as const) {
			const plan = renderedChartPlan(chartType);
			expect(plan.nativeObject).toBe("chart");
			expect(plan.fontFace).toBe(KCH_TOKENS.fonts.body);
			expect(plan.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.footnoteMinimum);
			expectWithinCanvas(plan.bounds);
		}
	});

	test("preserves every series value category and source unit", () => {
		const plan = renderedChartPlan("bar");
		expect(plan.series).toHaveLength(2);
		expect(plan.categories).toEqual(["1분기", "2분기", "3분기", "4분기"]);
		expect(plan.series.map((series) => series.values)).toEqual([
			[120, 138, 151, 164],
			[11, 14, 18, 21],
		]);
		expect(plan.unit).toBe("억 원");
		expect(plan.valueAxisTitle).toContain("억 원");
	});

	test("collapses a donut to the first series without dropping categories", () => {
		const plan = renderedChartPlan("donut");
		expect(plan.series).toHaveLength(1);
		expect(plan.series[0]?.values).toHaveLength(4);
		expect(plan.categories).toHaveLength(4);
	});

	test("writes native OOXML chart parts with editable cached values", async () => {
		const { slide, charts } = await slideXml((target) => {
			renderChart(target, renderedChartPlan("bar"));
		});
		expect(charts).toHaveLength(1);
		expect(charts[0]).toContain("<c:barChart>");
		expect(charts[0]).toContain("매출");
		expect(charts[0]).toContain("<c:v>164</c:v>");
		expect(slide).toContain("http://schemas.openxmlformats.org/drawingml/2006/chart");
		expect(slide).not.toContain("<p:pic>");
		for (const offset of graphicFrameOffsets(slide)) {
			expect(offset.x).toBeGreaterThanOrEqual(0);
			expect(offset.y).toBeGreaterThanOrEqual(0);
			expect(offset.x).toBeLessThanOrEqual(CANVAS.width * EMU_PER_INCH);
			expect(offset.y).toBeLessThanOrEqual(CANVAS.height * EMU_PER_INCH);
		}
	});

	test("rejects explicit bounds that leave the content region instead of clipping", () => {
		const outside = {
			x: CONTENT_REGION.x,
			y: CONTENT_REGION.y,
			width: CONTENT_REGION.width + 1,
			height: CONTENT_REGION.height,
		};
		expect(() => assertWithinContent(outside, "KCH-E-RENDER-CHART", "chart")).toThrow("KCH-E-RENDER-CHART");
		expect(() => planChart({ ...chartInput("line"), bounds: outside })).toThrow(RendererError);
		expect(assertWithinContent(CONTENT_REGION, "KCH-E-RENDER-CHART", "chart")).toEqual(CONTENT_REGION);
	});

	test("rejects empty and mismatched series instead of silently dropping data", () => {
		expect(() => planChart({ ...chartInput("bar"), series: [] })).toThrow(RendererError);
		expect(() =>
			planChart({
				...chartInput("bar"),
				series: [{ name: "매출", values: [1, 2] }],
			}),
		).toThrow("계열");
	});

	test("selects a deterministic alternate layout for over-long category labels", () => {
		const decision = planChart({
			chartType: "bar",
			categories: [
				"1분기 해상풍력 발전단지 계통연계 실적 상세 구분 0",
				"2분기 해상풍력 발전단지 계통연계 실적 상세 구분 1",
				"3분기 해상풍력 발전단지 계통연계 실적 상세 구분 2",
				"4분기 해상풍력 발전단지 계통연계 실적 상세 구분 3",
			],
			series: [{ name: "매출", values: [120, 138, 151, 164] }],
			unit: "억 원",
		});
		expect(decision).toEqual({ status: "alternate-layout", layout: "horizontal-bar" });
	});

	test("splits a chart that carries more categories than one slide can hold", () => {
		const categories = Array.from({ length: 24 }, (_, index) => `${index + 1}월차`);
		const decision = planChart({
			chartType: "line",
			categories,
			series: [{ name: "발전량", values: categories.map((_, index) => index * 3) }],
			unit: "GWh",
		});
		expect(decision).toEqual({ status: "split", chunks: 3 });
	});
});
