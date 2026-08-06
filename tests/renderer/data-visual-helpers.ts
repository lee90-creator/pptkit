import { expect } from "bun:test";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { CONTENT_REGION, planChart } from "../../src/renderer/charts.js";

export const EMU_PER_INCH = 914_400;
export const CANVAS = KCH_TOKENS.canvas;

export interface Bounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export function expectWithinCanvas(bounds: Bounds): void {
	expect(bounds.x).toBeGreaterThanOrEqual(0);
	expect(bounds.y).toBeGreaterThanOrEqual(0);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(CANVAS.width + 1e-9);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(CANVAS.height + 1e-9);
	expect(bounds.x).toBeGreaterThanOrEqual(CONTENT_REGION.x - 1e-9);
	expect(bounds.y).toBeGreaterThanOrEqual(CONTENT_REGION.y - 1e-9);
	expect(bounds.x + bounds.width).toBeLessThanOrEqual(CONTENT_REGION.x + CONTENT_REGION.width + 1e-9);
	expect(bounds.y + bounds.height).toBeLessThanOrEqual(CONTENT_REGION.y + CONTENT_REGION.height + 1e-9);
}

export const QUARTERS = ["1분기", "2분기", "3분기", "4분기"] as const;

export function chartInput(chartType: "bar" | "line" | "area" | "donut") {
	return {
		chartType,
		categories: [...QUARTERS],
		series: [
			{ name: "매출", values: [120, 138, 151, 164] },
			{ name: "영업이익", values: [11, 14, 18, 21] },
		],
		unit: "억 원",
	} as const;
}

export function renderedChartPlan(chartType: "bar" | "line" | "area" | "donut") {
	const decision = planChart(chartInput(chartType));
	if (decision.status !== "render") {
		throw new Error(`Expected render decision, received ${decision.status}`);
	}
	return decision.plan;
}

export const SPEC_ROWS = [
	{ cells: ["정격 출력", "5.56 MW", "제조사 사양서"] },
	{ cells: ["로터 직경", "158 m", "설계 도면"] },
	{ cells: ["허브 높이", "100 m", "설계 도면"] },
] as const;

export function tableInput(variant: "data" | "specification") {
	return {
		variant,
		columns: ["항목", "값", "출처"],
		rows: SPEC_ROWS.map((row) => ({ cells: [...row.cells] })),
		unit: "MW",
	} as const;
}

export const KPI_CARDS = [
	{ label: "누적 수주", value: 1_284, unit: "억 원" },
	{ label: "가동 설비", value: 46, unit: "기" },
	{ label: "고용 인원", value: 312, unit: "명" },
] as const;

export const MATRIX_INPUT = {
	rowLabels: ["안전", "품질", "원가"],
	columnLabels: ["1분기", "2분기", "3분기"],
	values: [
		[92, 95, 97],
		[88, 90, 94],
		[70, 76, 81],
	],
	unit: "점",
} as const;

export async function slideXml(build: (slide: PptxGenJS.PresSlide) => void): Promise<{
	readonly slide: string;
	readonly charts: readonly string[];
}> {
	const presentation = new PptxGenJS();
	presentation.layout = "LAYOUT_WIDE";
	const slide = presentation.addSlide();
	slide.background = { color: KCH_TOKENS.colors.background };
	build(slide);
	const buffer = await presentation.write({ outputType: "nodebuffer" });
	const archive = await JSZip.loadAsync(buffer as Buffer);
	const slideEntry = archive.file("ppt/slides/slide1.xml");
	if (!slideEntry) {
		throw new Error("Generated deck is missing ppt/slides/slide1.xml");
	}
	const chartNames = Object.keys(archive.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
	const charts = await Promise.all(
		chartNames.map(async (name) => {
			const entry = archive.file(name);
			if (!entry) {
				throw new Error(`Missing chart part: ${name}`);
			}
			return entry.async("string");
		}),
	);
	return { slide: await slideEntry.async("string"), charts };
}

export function graphicFrameOffsets(xml: string): readonly { readonly x: number; readonly y: number }[] {
	return [...xml.matchAll(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/g)]
		.map((match) => ({ x: Number(match[1]), y: Number(match[2]) }))
		.filter((offset) => offset.x !== 0 || offset.y !== 0);
}
