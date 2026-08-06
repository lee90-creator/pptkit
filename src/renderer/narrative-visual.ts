import type PptxGenJS from "pptxgenjs";

import { KCH_TOKENS } from "../design-system/tokens.js";
import type { SlideSpec } from "../planner/normalize.js";
import { planChart, renderChart } from "./charts.js";

interface VisualBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

type SourceDatum = NonNullable<SlideSpec["visual"]["sourceData"]>[number];

function displayValue(datum: SourceDatum): string {
	const value = typeof datum.value === "number" ? datum.value.toLocaleString("ko-KR") : datum.value;
	if (!datum.unit) return value;
	return `${value}${datum.unit === "%" ? "" : " "}${datum.unit}`;
}

function visualData(entry: SlideSpec): readonly SourceDatum[] {
	return entry.visual.sourceData ?? [];
}

function renderCards(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const entries = data.slice(0, 6);
	const columns = entries.length <= 3 ? entries.length : 3;
	const rows = Math.ceil(entries.length / Math.max(columns, 1));
	const gap = 0.16;
	const width = (bounds.width - gap * Math.max(columns - 1, 0)) / Math.max(columns, 1);
	const height = (bounds.height - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1);
	for (const [index, datum] of entries.entries()) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const x = bounds.x + column * (width + gap);
		const y = bounds.y + row * (height + gap);
		slide.addShape("roundRect", {
			x,
			y,
			w: width,
			h: height,
			rectRadius: 0.05,
			fill: { color: index === 0 ? KCH_TOKENS.colors.sectionNumber : KCH_TOKENS.colors.background },
			line: { color: KCH_TOKENS.colors.line, pt: 1 },
			objectName: `KCH-data-card-${index + 1}`,
		});
		slide.addText(datum.label, {
			x: x + 0.18,
			y: y + 0.16,
			w: width - 0.36,
			h: Math.min(0.38, height * 0.28),
			fontFace: KCH_TOKENS.fonts.heading,
			fontSize: 13,
			color: KCH_TOKENS.colors.navy,
			bold: true,
			margin: 0,
			fit: "shrink",
		});
		slide.addText(displayValue(datum), {
			x: x + 0.18,
			y: y + Math.min(0.62, height * 0.4),
			w: width - 0.36,
			h: Math.max(0.45, height * 0.42),
			fontFace: KCH_TOKENS.fonts.body,
			fontSize: typeof datum.value === "number" ? 24 : 15,
			color: KCH_TOKENS.colors.body,
			bold: typeof datum.value === "number",
			margin: 0,
			fit: "shrink",
			valign: "mid",
		});
	}
}

function renderProcess(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const entries = data.slice(0, 6);
	const gap = 0.08;
	const width = (bounds.width - gap * Math.max(entries.length - 1, 0)) / Math.max(entries.length, 1);
	for (const [index, datum] of entries.entries()) {
		const x = bounds.x + index * (width + gap);
		slide.addShape("chevron", {
			x,
			y: bounds.y + bounds.height * 0.2,
			w: width,
			h: bounds.height * 0.6,
			fill: { color: index === entries.length - 1 ? KCH_TOKENS.colors.primary : KCH_TOKENS.colors.sectionNumber },
			line: { color: KCH_TOKENS.colors.line, pt: 0.75 },
		});
		slide.addText(datum.label, {
			x: x + width * 0.15,
			y: bounds.y + bounds.height * 0.38,
			w: width * 0.62,
			h: bounds.height * 0.22,
			fontFace: KCH_TOKENS.fonts.heading,
			fontSize: 14,
			color: index === entries.length - 1 ? KCH_TOKENS.colors.background : KCH_TOKENS.colors.navy,
			bold: true,
			align: "center",
			margin: 0,
			fit: "shrink",
		});
	}
}

function renderTable(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const rows = [
		[
			{ text: "항목", options: { bold: true, color: KCH_TOKENS.colors.background } },
			{ text: "내용", options: { bold: true, color: KCH_TOKENS.colors.background } },
		],
		...data.slice(0, 8).map((datum) => [datum.label, displayValue(datum)]),
	];
	slide.addTable(rows, {
		x: bounds.x,
		y: bounds.y,
		w: bounds.width,
		h: bounds.height,
		colW: [bounds.width * 0.38, bounds.width * 0.62],
		border: { type: "solid", pt: 0.75, color: KCH_TOKENS.colors.line },
		color: KCH_TOKENS.colors.body,
		fill: KCH_TOKENS.colors.background,
		fontFace: KCH_TOKENS.fonts.body,
		fontSize: 14,
		margin: 8,
		rowH: bounds.height / Math.max(rows.length, 1),
		autoPage: false,
		objectName: "KCH-native-table",
	});
}

function renderDiagram(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const entries = data.slice(0, 6);
	const columns = entries.length <= 3 ? entries.length : 3;
	const rows = Math.ceil(entries.length / Math.max(columns, 1));
	const gap = 0.34;
	const width = (bounds.width - gap * Math.max(columns - 1, 0)) / Math.max(columns, 1);
	const height = Math.min(1.45, (bounds.height - gap * Math.max(rows - 1, 0)) / Math.max(rows, 1));
	for (const [index, datum] of entries.entries()) {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const x = bounds.x + column * (width + gap);
		const y = bounds.y + row * (height + gap) + (bounds.height - rows * height - (rows - 1) * gap) / 2;
		slide.addShape("roundRect", {
			x,
			y,
			w: width,
			h: height,
			rectRadius: 0.05,
			fill: { color: index === 0 ? KCH_TOKENS.colors.sectionNumber : KCH_TOKENS.colors.background },
			line: { color: KCH_TOKENS.colors.primary, pt: 1.25 },
			objectName: `KCH-diagram-node-${index + 1}`,
		});
		slide.addText(`${datum.label}\n${displayValue(datum)}`, {
			x: x + 0.18,
			y: y + 0.16,
			w: width - 0.36,
			h: height - 0.32,
			fontFace: KCH_TOKENS.fonts.body,
			fontSize: 15,
			color: KCH_TOKENS.colors.body,
			bold: true,
			align: "center",
			valign: "mid",
			margin: 0,
			fit: "shrink",
		});
		if (index > 0) {
			const previousColumn = (index - 1) % columns;
			if (previousColumn < column) {
				slide.addShape("line", {
					x: x - gap,
					y: y + height / 2,
					w: gap,
					h: 0,
					line: { color: KCH_TOKENS.colors.line, pt: 1.25, beginArrowType: "none", endArrowType: "triangle" },
				});
			}
		}
	}
}

function renderText(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const text = data.map((datum) => `${datum.label}: ${displayValue(datum)}`).join("\n");
	slide.addText(text, {
		x: bounds.x + 0.3,
		y: bounds.y + 0.3,
		w: bounds.width - 0.6,
		h: bounds.height - 0.6,
		fontFace: KCH_TOKENS.fonts.body,
		fontSize: 20,
		color: KCH_TOKENS.colors.body,
		margin: 0,
		breakLine: false,
		fit: "shrink",
		valign: "mid",
	});
}

function renderTimeline(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): void {
	const entries = data.slice(0, 6);
	const axisY = bounds.y + bounds.height * 0.55;
	slide.addShape("line", {
		x: bounds.x + 0.3,
		y: axisY,
		w: bounds.width - 0.6,
		h: 0,
		line: { color: KCH_TOKENS.colors.line, pt: 2 },
	});
	for (const [index, datum] of entries.entries()) {
		const x = bounds.x + ((index + 0.5) * bounds.width) / entries.length;
		slide.addShape("ellipse", {
			x: x - 0.1,
			y: axisY - 0.1,
			w: 0.2,
			h: 0.2,
			fill: { color: KCH_TOKENS.colors.primary },
			line: { color: KCH_TOKENS.colors.primary },
		});
		slide.addText(datum.label, {
			x: x - bounds.width / entries.length / 2,
			y: index % 2 === 0 ? bounds.y : axisY + 0.35,
			w: bounds.width / entries.length,
			h: bounds.height * 0.28,
			fontFace: KCH_TOKENS.fonts.heading,
			fontSize: 13,
			color: KCH_TOKENS.colors.navy,
			bold: true,
			align: "center",
			margin: 0,
			fit: "shrink",
		});
	}
}

function renderBarChart(slide: PptxGenJS.PresSlide, data: readonly SourceDatum[], bounds: VisualBounds): boolean {
	const numeric = data.filter((datum) => typeof datum.value === "number");
	if (numeric.length === 0) return false;
	const decision = planChart({
		chartType: "bar",
		categories: numeric.map((datum) => datum.label),
		series: [{ name: "값", values: numeric.map((datum) => (typeof datum.value === "number" ? datum.value : 0)) }],
		...(numeric[0]?.unit ? { unit: numeric[0].unit } : {}),
		bounds,
	});
	if (decision.status !== "render") return false;
	renderChart(slide, decision.plan);
	return true;
}

export function renderNarrativeVisual(slide: PptxGenJS.PresSlide, entry: SlideSpec, bounds: VisualBounds): void {
	const data = visualData(entry);
	if (data.length === 0) return;
	if (entry.visual.type === "chart" && renderBarChart(slide, data, bounds)) return;
	if (entry.visual.type === "table") {
		renderTable(slide, data, bounds);
		return;
	}
	if (entry.visual.type === "diagram") {
		renderDiagram(slide, data, bounds);
		return;
	}
	if (entry.visual.type === "process") {
		renderProcess(slide, data, bounds);
		return;
	}
	if (entry.visual.type === "timeline") {
		renderTimeline(slide, data, bounds);
		return;
	}
	if (entry.visual.type === "text") {
		renderText(slide, data, bounds);
		return;
	}
	renderCards(slide, data, bounds);
}
