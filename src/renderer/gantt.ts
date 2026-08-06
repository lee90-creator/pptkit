import { KCH_TOKENS } from "../design-system/tokens.js";
import { DiagramRenderError, RENDER_LAYOUT, RENDER_TYPE_SCALE, contentFrame, createPlanBuilder } from "./diagrams.js";
import type { Rect, RenderPlan } from "./diagrams.js";

export interface GanttTask {
	readonly id: string;
	readonly label: string;
	readonly startIndex: number;
	readonly spanCount: number;
}

export interface GanttInput {
	readonly periods: readonly string[];
	readonly tasks: readonly GanttTask[];
}

const TOKENS = KCH_TOKENS;
const MAX_TASKS = 6;
const LABEL_COLUMN_RATIO = 0.22;
const HEADER_HEIGHT = 30 / 72;

export function buildGanttPlan(input: GanttInput): RenderPlan {
	if (input.periods.length === 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "간트 차트에는 최소 한 개의 기간이 필요합니다.");
	}
	if (input.tasks.length === 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "간트 차트에는 최소 한 개의 작업이 필요합니다.");
	}
	if (input.tasks.length > MAX_TASKS) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", `간트 작업이 최대 ${MAX_TASKS}개를 초과했습니다.`);
	}
	for (const task of input.tasks) {
		if (!Number.isInteger(task.startIndex) || !Number.isInteger(task.spanCount) || task.spanCount < 1) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", `작업 ${task.id}의 기간 구간이 올바르지 않습니다.`);
		}
		if (task.startIndex < 0 || task.startIndex + task.spanCount > input.periods.length) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", `작업 ${task.id}의 구간이 마지막 기간을 넘어섭니다.`);
		}
	}

	const frame = contentFrame();
	const builder = createPlanBuilder("mini-gantt");
	const labelWidth = frame.w * LABEL_COLUMN_RATIO;
	const plotX = frame.x + labelWidth;
	const plotWidth = frame.w - labelWidth;
	const periodWidth = plotWidth / input.periods.length;
	const rowHeight = (frame.h - HEADER_HEIGHT) / input.tasks.length;
	const barHeight = Math.min(rowHeight * 0.52, 26 / 72);

	for (const [index, period] of input.periods.entries()) {
		const columnX = plotX + periodWidth * index;
		builder.text(`period-${index}`, { x: columnX, y: frame.y, w: periodWidth, h: HEADER_HEIGHT }, period, {
			fontFace: TOKENS.fonts.heading,
			fontSize: RENDER_TYPE_SCALE.caption,
			color: TOKENS.colors.navy,
			bold: true,
			align: "center",
		});
		builder.shape(
			`gridline-${index}`,
			{ x: columnX, y: frame.y + HEADER_HEIGHT, w: 1 / 72, h: frame.h - HEADER_HEIGHT },
			"rect",
			TOKENS.colors.line,
			TOKENS.colors.line,
			0,
		);
	}
	builder.shape(
		"gridline-end",
		{ x: plotX + plotWidth - 1 / 72, y: frame.y + HEADER_HEIGHT, w: 1 / 72, h: frame.h - HEADER_HEIGHT },
		"rect",
		TOKENS.colors.line,
		TOKENS.colors.line,
		0,
	);

	for (const [index, task] of input.tasks.entries()) {
		const rowY = frame.y + HEADER_HEIGHT + rowHeight * index;
		const terminalInset = task.startIndex + task.spanCount === input.periods.length ? 0.12 : 0;
		const labelBounds: Rect = {
			x: frame.x,
			y: rowY,
			w: labelWidth - RENDER_LAYOUT.labelGap,
			h: rowHeight,
		};
		builder.text(`task-${task.id}-label`, labelBounds, task.label, {
			color: TOKENS.colors.navy,
			valign: "middle",
		});
		builder.shape(
			`bar-${task.id}`,
			{
				x: plotX + periodWidth * task.startIndex,
				y: rowY + (rowHeight - barHeight) / 2,
				w: periodWidth * task.spanCount - terminalInset,
				h: barHeight,
			},
			"roundRect",
			TOKENS.colors.primary,
			TOKENS.colors.primary,
		);
	}
	return builder.build();
}
