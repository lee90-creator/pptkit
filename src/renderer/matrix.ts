import type PptxGenJS from "pptxgenjs";

import { resolveCapacity } from "../design-system/capacity.js";
import type { Bounds } from "../design-system/header-skins.js";
import { KCH_TOKENS } from "../design-system/tokens.js";
import { CONTENT_REGION, RendererError, assertWithinContent, decisionFromCapacity } from "./charts.js";

export interface MatrixInput {
	readonly rowLabels: readonly string[];
	readonly columnLabels: readonly string[];
	readonly values: readonly (readonly number[])[];
	readonly unit?: string;
	readonly cornerLabel?: string;
	readonly bounds?: Bounds;
}

export interface MatrixCellPlan {
	readonly text: string;
	readonly fontFace: string;
	readonly fontSize: number;
	readonly bold: boolean;
	readonly color: string;
	readonly fill: string;
	readonly align: "left" | "center";
}

export interface MatrixPlan {
	readonly nativeObject: "table";
	readonly bounds: Bounds;
	readonly rows: readonly (readonly MatrixCellPlan[])[];
	readonly columnWidths: readonly number[];
	readonly rowHeight: number;
	readonly fontSize: number;
	readonly objectName: string;
}

export type MatrixDecision =
	| { readonly status: "render"; readonly plan: MatrixPlan }
	| { readonly status: "alternate-layout"; readonly layout: "matrix-landscape" }
	| { readonly status: "split"; readonly chunks: number };

const HEAT_SCALE = [
	KCH_TOKENS.colors.sectionNumber,
	KCH_TOKENS.colors.line,
	KCH_TOKENS.colors.blueSoft,
	KCH_TOKENS.colors.primary,
	KCH_TOKENS.colors.navy,
] as const;
const INVERTED_TEXT_FROM_STEP = 3;
const LABEL_COLUMN_WEIGHT = 1.4;

function heatStep(value: number, minimum: number, maximum: number): number {
	if (maximum === minimum) {
		return 0;
	}
	const ratio = (value - minimum) / (maximum - minimum);
	return Math.min(HEAT_SCALE.length - 1, Math.floor(ratio * HEAT_SCALE.length));
}

function heatFill(step: number): string {
	return HEAT_SCALE[step] ?? KCH_TOKENS.colors.sectionNumber;
}

function matrixCharacterCount(input: MatrixInput, cellTexts: readonly (readonly string[])[]): number {
	const labelCharacters =
		input.rowLabels.reduce((total, label) => total + label.length, 0) +
		input.columnLabels.reduce((total, label) => total + label.length, 0);
	const valueCharacters = cellTexts.reduce(
		(total, row) => total + row.reduce((rowTotal, text) => rowTotal + text.length, 0),
		0,
	);
	return labelCharacters + valueCharacters;
}

export function planMatrix(input: MatrixInput): MatrixDecision {
	if (input.rowLabels.length === 0 || input.columnLabels.length === 0) {
		throw new RendererError("KCH-E-RENDER-MATRIX", "매트릭스 행 또는 열 라벨이 비어 있습니다.");
	}
	if (input.values.length !== input.rowLabels.length) {
		throw new RendererError("KCH-E-RENDER-MATRIX", "매트릭스 값 행 수가 행 라벨 수와 다릅니다.");
	}
	for (const [index, row] of input.values.entries()) {
		if (row.length !== input.columnLabels.length) {
			throw new RendererError(
				"KCH-E-RENDER-MATRIX",
				`매트릭스 ${index + 1}행의 값 수가 열 라벨 수와 다릅니다. 값을 생략하지 않습니다.`,
			);
		}
	}

	const cellTexts = input.values.map((row) =>
		row.map((value) =>
			input.unit ? `${value.toLocaleString("ko-KR")}${input.unit.replaceAll(" ", "")}` : value.toLocaleString("ko-KR"),
		),
	);
	const maxUnbroken = [...input.rowLabels, ...input.columnLabels, ...cellTexts.flat()].reduce(
		(longest, text) => Math.max(longest, ...text.split(/\s+/).map((token) => token.length)),
		0,
	);
	const capacity = resolveCapacity({
		kind: "table",
		characterCount: matrixCharacterCount(input, cellTexts),
		maxUnbrokenCharacters: maxUnbroken,
		itemCount: input.rowLabels.length,
		splittable: input.rowLabels.length > 1,
	});
	const alternate = decisionFromCapacity(capacity, "matrix-landscape");
	if (alternate) {
		return alternate;
	}

	const flatValues = input.values.flat();
	const minimum = Math.min(...flatValues);
	const maximum = Math.max(...flatValues);
	const fontSize = KCH_TOKENS.fontSizes.tableMinimum + 1;
	const region = input.bounds ?? CONTENT_REGION;
	const rowCount = input.rowLabels.length + 1;
	const rowHeight = region.height / rowCount;
	const bounds = assertWithinContent(
		{ x: region.x, y: region.y, width: region.width, height: rowHeight * rowCount },
		"KCH-E-RENDER-MATRIX",
		"matrix",
	);
	const weights = [LABEL_COLUMN_WEIGHT, ...input.columnLabels.map(() => 1)];
	const totalWeight = weights.reduce((total, weight) => total + weight, 0);
	const columnWidths = weights.map((weight) => (bounds.width * weight) / totalWeight);

	const header: readonly MatrixCellPlan[] = [input.cornerLabel ?? "구분", ...input.columnLabels].map(
		(label, index): MatrixCellPlan => ({
			text: label,
			fontFace: KCH_TOKENS.fonts.body,
			fontSize,
			bold: true,
			color: KCH_TOKENS.colors.background,
			fill: KCH_TOKENS.colors.navy,
			align: index === 0 ? "left" : "center",
		}),
	);
	const body = input.rowLabels.map((label, rowIndex): readonly MatrixCellPlan[] => {
		const rowValues = input.values[rowIndex] ?? [];
		const texts = cellTexts[rowIndex] ?? [];
		const labelCell: MatrixCellPlan = {
			text: label,
			fontFace: KCH_TOKENS.fonts.body,
			fontSize,
			bold: true,
			color: KCH_TOKENS.colors.body,
			fill: KCH_TOKENS.colors.sectionNumber,
			align: "left",
		};
		const valueCells = rowValues.map((value, columnIndex): MatrixCellPlan => {
			const step = heatStep(value, minimum, maximum);
			return {
				text: texts[columnIndex] ?? value.toLocaleString("ko-KR"),
				fontFace: KCH_TOKENS.fonts.body,
				fontSize,
				bold: true,
				color: step >= INVERTED_TEXT_FROM_STEP ? KCH_TOKENS.colors.background : KCH_TOKENS.colors.body,
				fill: heatFill(step),
				align: "center",
			};
		});
		return [labelCell, ...valueCells];
	});

	return {
		status: "render",
		plan: {
			nativeObject: "table",
			bounds,
			rows: [header, ...body],
			columnWidths,
			rowHeight,
			fontSize,
			objectName: "KCH-matrix-heatmap",
		},
	};
}

export function renderMatrix(slide: PptxGenJS.PresSlide, plan: MatrixPlan): void {
	const rows = plan.rows.map((row) =>
		row.map((cell) => ({
			text: cell.text,
			options: {
				fontFace: cell.fontFace,
				fontSize: cell.fontSize,
				bold: cell.bold,
				color: cell.color,
				fill: { color: cell.fill },
				align: cell.align,
				valign: "middle" as const,
				margin: 4,
			},
		})),
	);
	slide.addTable(rows, {
		x: plan.bounds.x,
		y: plan.bounds.y,
		w: plan.bounds.width,
		h: plan.bounds.height,
		colW: [...plan.columnWidths],
		rowH: plan.rowHeight,
		objectName: plan.objectName,
		border: { type: "solid", pt: 0.75, color: KCH_TOKENS.colors.line },
		autoPage: false,
	});
}
