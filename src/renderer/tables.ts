import type PptxGenJS from "pptxgenjs";

import { resolveCapacity } from "../design-system/capacity.js";
import type { Bounds } from "../design-system/header-skins.js";
import { KCH_TOKENS } from "../design-system/tokens.js";
import { CONTENT_REGION, RendererError, assertWithinContent, decisionFromCapacity } from "./charts.js";

export type TableVariant = "data" | "specification";
export type TableCellValue = string | number;

export interface TableRowInput {
	readonly cells: readonly TableCellValue[];
}

export interface TableInput {
	readonly variant: TableVariant;
	readonly columns: readonly string[];
	readonly rows: readonly TableRowInput[];
	readonly unit?: string;
	readonly bounds?: Bounds;
}

export interface TableCellPlan {
	readonly text: string;
	readonly fontFace: string;
	readonly fontSize: number;
	readonly bold: boolean;
	readonly color: string;
	readonly fill: string;
	readonly align: "left" | "right";
}

export interface TablePlan {
	readonly nativeObject: "table";
	readonly variant: TableVariant;
	readonly bounds: Bounds;
	readonly rows: readonly (readonly TableCellPlan[])[];
	readonly columnWidths: readonly number[];
	readonly rowHeight: number;
	readonly fontSize: number;
	readonly objectName: string;
}

export type TableDecision =
	| { readonly status: "render"; readonly plan: TablePlan }
	| { readonly status: "alternate-layout"; readonly layout: "table-landscape" }
	| { readonly status: "split"; readonly chunks: number };

const LABEL_COLUMN_WEIGHT = { data: 1, specification: 1.6 } as const satisfies Record<TableVariant, number>;
const MAX_TABLE_HEIGHT = CONTENT_REGION.height;

function cellText(value: TableCellValue): string {
	return typeof value === "number" ? value.toLocaleString("ko-KR") : value;
}

function longestToken(value: string): number {
	return value.split(/\s+/).reduce((longest, token) => Math.max(longest, token.length), 0);
}

function tableCharacterCount(input: TableInput): number {
	const headerCharacters = input.columns.reduce((total, column) => total + column.length, 0);
	const bodyCharacters = input.rows.reduce(
		(total: number, row) => total + row.cells.reduce((rowTotal: number, cell) => rowTotal + cellText(cell).length, 0),
		0,
	);
	return headerCharacters + bodyCharacters;
}

function columnWidths(input: TableInput, width: number): readonly number[] {
	const weights = input.columns.map((_, index) => (index === 0 ? LABEL_COLUMN_WEIGHT[input.variant] : 1));
	const totalWeight = weights.reduce((total, weight) => total + weight, 0);
	return weights.map((weight) => (width * weight) / totalWeight);
}

function headerLabels(input: TableInput): readonly string[] {
	return input.columns.map((column, index) => (index === 1 && input.unit ? `${column} (${input.unit})` : column));
}

export function planTable(input: TableInput): TableDecision {
	if (input.columns.length === 0) {
		throw new RendererError("KCH-E-RENDER-TABLE", "표의 열 정의가 비어 있습니다.");
	}
	if (input.rows.length === 0) {
		throw new RendererError("KCH-E-RENDER-TABLE", "표의 행이 비어 있습니다.");
	}
	for (const [index, row] of input.rows.entries()) {
		if (row.cells.length !== input.columns.length) {
			throw new RendererError(
				"KCH-E-RENDER-TABLE",
				`표 ${index + 1}행의 셀 수가 열 수와 다릅니다. 행을 생략하지 않습니다.`,
			);
		}
	}

	const maxUnbroken = input.rows.reduce(
		(longest: number, row) =>
			row.cells.reduce((rowLongest: number, cell) => Math.max(rowLongest, longestToken(cellText(cell))), longest),
		input.columns.reduce((longest: number, column) => Math.max(longest, longestToken(column)), 0),
	);
	const capacity = resolveCapacity({
		kind: "table",
		characterCount: tableCharacterCount(input),
		maxUnbrokenCharacters: maxUnbroken,
		itemCount: input.rows.length,
		splittable: input.rows.length > 1,
	});
	const alternate = decisionFromCapacity(capacity, "table-landscape");
	if (alternate) {
		return alternate;
	}

	const bounds = input.bounds ?? CONTENT_REGION;
	const rowCount = input.rows.length + 1;
	const rowHeight = Math.min(Math.min(bounds.height, MAX_TABLE_HEIGHT) / rowCount, 0.72);
	const planBounds = assertWithinContent(
		{ x: bounds.x, y: bounds.y, width: bounds.width, height: rowHeight * rowCount },
		"KCH-E-RENDER-TABLE",
		"table",
	);
	const widths = columnWidths(input, planBounds.width);
	const fontSize = KCH_TOKENS.fontSizes.tableMinimum + 1;

	const header: readonly TableCellPlan[] = headerLabels(input).map((label, index) => ({
		text: label,
		fontFace: KCH_TOKENS.fonts.body,
		fontSize,
		bold: true,
		color: KCH_TOKENS.colors.background,
		fill: KCH_TOKENS.colors.navy,
		align: input.variant === "data" && index > 0 ? "right" : "left",
	}));
	const body = input.rows.map((row, rowIndex) =>
		row.cells.map(
			(cell, columnIndex): TableCellPlan => ({
				text: cellText(cell),
				fontFace: KCH_TOKENS.fonts.body,
				fontSize,
				bold: input.variant === "specification" && columnIndex === 0,
				color: KCH_TOKENS.colors.body,
				fill: rowIndex % 2 === 0 ? KCH_TOKENS.colors.background : KCH_TOKENS.colors.sectionNumber,
				align: typeof cell === "number" ? "right" : "left",
			}),
		),
	);

	return {
		status: "render",
		plan: {
			nativeObject: "table",
			variant: input.variant,
			bounds: planBounds,
			rows: [header, ...body],
			columnWidths: widths,
			rowHeight,
			fontSize,
			objectName: `KCH-table-${input.variant}`,
		},
	};
}

export function renderTable(slide: PptxGenJS.PresSlide, plan: TablePlan): void {
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
		colW: [...plan.columnWidths],
		rowH: plan.rowHeight,
		objectName: plan.objectName,
		border: { type: "solid", pt: 0.75, color: KCH_TOKENS.colors.line },
		autoPage: false,
	});
}
