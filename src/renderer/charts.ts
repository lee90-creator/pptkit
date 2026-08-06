import type PptxGenJS from "pptxgenjs";

import { type CapacityDecision, resolveCapacity } from "../design-system/capacity.js";
import type { Bounds } from "../design-system/header-skins.js";
import { KCH_TOKENS } from "../design-system/tokens.js";

export type RendererErrorCode =
	| "KCH-E-RENDER-CHART"
	| "KCH-E-RENDER-TABLE"
	| "KCH-E-RENDER-METRIC"
	| "KCH-E-RENDER-MATRIX";

export class RendererError extends Error {
	constructor(
		readonly code: RendererErrorCode,
		message: string,
	) {
		super(`${code}: ${message}`);
		this.name = "RendererError";
	}
}

export const CONTENT_REGION: Bounds = {
	x: KCH_TOKENS.content.left,
	y: KCH_TOKENS.content.top,
	width: KCH_TOKENS.canvas.width - KCH_TOKENS.content.left - KCH_TOKENS.content.right,
	height: KCH_TOKENS.canvas.height - KCH_TOKENS.content.top - KCH_TOKENS.content.bottom,
};

export const GUTTER = 12 / 72;

export function assertWithinContent(bounds: Bounds, code: RendererErrorCode, id: string): Bounds {
	const withinLeft = bounds.x >= CONTENT_REGION.x - 1e-9;
	const withinTop = bounds.y >= CONTENT_REGION.y - 1e-9;
	const withinRight = bounds.x + bounds.width <= CONTENT_REGION.x + CONTENT_REGION.width + 1e-9;
	const withinBottom = bounds.y + bounds.height <= CONTENT_REGION.y + CONTENT_REGION.height + 1e-9;
	if (!withinLeft || !withinTop || !withinRight || !withinBottom) {
		throw new RendererError(code, `${id} 객체가 슬라이드 콘텐츠 영역을 벗어났습니다.`);
	}
	return bounds;
}

export function decisionFromCapacity<T extends string>(
	decision: CapacityDecision,
	fallbackLayout: T,
):
	| { readonly status: "alternate-layout"; readonly layout: T }
	| { readonly status: "split"; readonly chunks: number }
	| undefined {
	if (decision.action === "alternate-layout") {
		return { status: "alternate-layout", layout: fallbackLayout };
	}
	if (decision.action === "split") {
		return { status: "split", chunks: decision.chunks };
	}
	return undefined;
}

export type ChartKind = "bar" | "line" | "area" | "donut";
export type PptxChartType = "bar" | "line" | "area" | "doughnut";

export interface ChartSeries {
	readonly name: string;
	readonly values: readonly number[];
}

export interface ChartInput {
	readonly chartType: ChartKind;
	readonly categories: readonly string[];
	readonly series: readonly ChartSeries[];
	readonly unit?: string;
	readonly bounds?: Bounds;
}

export interface ChartPlan {
	readonly nativeObject: "chart";
	readonly pptxType: PptxChartType;
	readonly bounds: Bounds;
	readonly categories: readonly string[];
	readonly series: readonly ChartSeries[];
	readonly unit?: string;
	readonly valueAxisTitle: string;
	readonly fontFace: string;
	readonly fontSize: number;
	readonly seriesColors: readonly string[];
	readonly objectName: string;
}

export type ChartDecision =
	| { readonly status: "render"; readonly plan: ChartPlan }
	| { readonly status: "alternate-layout"; readonly layout: "horizontal-bar" }
	| { readonly status: "split"; readonly chunks: number };

const PPTX_CHART_TYPE = {
	bar: "bar",
	line: "line",
	area: "area",
	donut: "doughnut",
} as const satisfies Record<ChartKind, PptxChartType>;

const CHART_CATEGORY_LABEL_LIMIT = 12;
const SERIES_COLORS = [
	KCH_TOKENS.colors.primary,
	KCH_TOKENS.colors.navy,
	KCH_TOKENS.colors.cyan,
	KCH_TOKENS.colors.line,
] as const;

function chartCharacterCount(input: ChartInput): number {
	const categoryCharacters = input.categories.reduce((total, label) => total + label.length, 0);
	const seriesCharacters = input.series.reduce(
		(total, series) => total + series.name.length + series.values.length * 6,
		0,
	);
	return categoryCharacters + seriesCharacters;
}

export function planChart(input: ChartInput): ChartDecision {
	if (input.categories.length === 0) {
		throw new RendererError("KCH-E-RENDER-CHART", "차트 범주가 비어 있습니다.");
	}
	if (input.series.length === 0) {
		throw new RendererError("KCH-E-RENDER-CHART", "차트 계열이 비어 있습니다.");
	}
	for (const series of input.series) {
		if (series.values.length !== input.categories.length) {
			throw new RendererError(
				"KCH-E-RENDER-CHART",
				`차트 계열 "${series.name}"의 값 수가 범주 수와 다릅니다. 값을 생략하지 않습니다.`,
			);
		}
	}

	const longestLabel = Math.max(...input.categories.map((label) => label.length));
	if (input.chartType === "bar" && longestLabel > CHART_CATEGORY_LABEL_LIMIT) {
		return { status: "alternate-layout", layout: "horizontal-bar" };
	}

	const capacity = resolveCapacity({
		kind: "chart",
		characterCount: chartCharacterCount(input),
		maxUnbrokenCharacters: longestLabel,
		itemCount: input.categories.length,
		splittable: true,
	});
	const alternate = decisionFromCapacity(capacity, "horizontal-bar");
	if (alternate) {
		return alternate;
	}

	const series = input.chartType === "donut" ? input.series.slice(0, 1) : input.series;
	const bounds = assertWithinContent(input.bounds ?? CONTENT_REGION, "KCH-E-RENDER-CHART", "chart");
	const unit = input.unit;
	const base = {
		nativeObject: "chart",
		pptxType: PPTX_CHART_TYPE[input.chartType],
		bounds,
		categories: [...input.categories],
		series: series.map((entry) => ({ name: entry.name, values: [...entry.values] })),
		valueAxisTitle: unit ? `단위: ${unit}` : "값",
		fontFace: KCH_TOKENS.fonts.body,
		fontSize: KCH_TOKENS.fontSizes.footnoteMinimum + 2,
		seriesColors: SERIES_COLORS.slice(0, Math.max(series.length, input.categories.length)),
		objectName: `KCH-chart-${input.chartType}`,
	} as const;
	return { status: "render", plan: unit === undefined ? base : { ...base, unit } };
}

export function renderChart(slide: PptxGenJS.PresSlide, plan: ChartPlan): void {
	const data = plan.series.map((series) => ({
		name: series.name,
		labels: [...plan.categories],
		values: [...series.values],
	}));
	slide.addChart(plan.pptxType, data, {
		x: plan.bounds.x,
		y: plan.bounds.y,
		w: plan.bounds.width,
		h: plan.bounds.height,
		objectName: plan.objectName,
		chartColors: [...plan.seriesColors],
		showLegend: plan.pptxType !== "doughnut" ? plan.series.length > 1 : true,
		legendPos: "b",
		legendFontFace: plan.fontFace,
		legendFontSize: plan.fontSize,
		catAxisLabelFontFace: plan.fontFace,
		catAxisLabelFontSize: plan.fontSize,
		catAxisLabelColor: KCH_TOKENS.colors.body,
		valAxisLabelFontFace: plan.fontFace,
		valAxisLabelFontSize: plan.fontSize,
		valAxisLabelColor: KCH_TOKENS.colors.body,
		valAxisTitle: plan.valueAxisTitle,
		showValAxisTitle: plan.pptxType !== "doughnut",
		valAxisTitleFontFace: plan.fontFace,
		valAxisTitleFontSize: plan.fontSize,
		valAxisTitleColor: KCH_TOKENS.colors.body,
		dataLabelFontFace: plan.fontFace,
		dataLabelFontSize: plan.fontSize,
		dataLabelColor: KCH_TOKENS.colors.body,
		showValue: plan.pptxType === "doughnut",
		holeSize: 55,
		lineDataSymbol: "circle",
		border: { pt: 0.75, color: KCH_TOKENS.colors.line },
	});
}
