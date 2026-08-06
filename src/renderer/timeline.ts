import { KCH_TOKENS } from "../design-system/tokens.js";
import { DiagramRenderError, RENDER_LAYOUT, RENDER_TYPE_SCALE, contentFrame, createPlanBuilder } from "./diagrams.js";
import type { Rect, RenderPlan } from "./diagrams.js";

export interface TimelineEvent {
	readonly date: string;
	readonly label: string;
	readonly detail?: string;
}

export interface TimelineInput {
	readonly events: readonly TimelineEvent[];
}

const TOKENS = KCH_TOKENS;
const AXIS_THICKNESS = 3 / 72;
const MARKER_DIAMETER = 16 / 72;

export function buildTimelinePlan(input: TimelineInput): RenderPlan {
	if (input.events.length === 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "타임라인에는 최소 한 개의 이정표가 필요합니다.");
	}
	if (input.events.length > RENDER_LAYOUT.maxTimelineEvents) {
		throw new DiagramRenderError(
			"KCH-E-RENDER-CAPACITY",
			`타임라인 이정표가 한 슬라이드 최대 ${RENDER_LAYOUT.maxTimelineEvents}개를 초과했습니다.`,
		);
	}

	const frame = contentFrame();
	const builder = createPlanBuilder("timeline");
	const axisY = frame.y + frame.h / 2;
	const slotWidth = frame.w / input.events.length;
	const firstCenterX = frame.x + slotWidth * 0.5;
	const lastCenterX = frame.x + slotWidth * (input.events.length - 0.5);
	const axisBounds: Rect = {
		x: firstCenterX,
		y: axisY - AXIS_THICKNESS / 2,
		w: Math.max(lastCenterX - firstCenterX, MARKER_DIAMETER),
		h: AXIS_THICKNESS,
	};
	builder.shape("axis", axisBounds, "rect", TOKENS.colors.line, TOKENS.colors.line);

	const labelWidth = slotWidth - RENDER_LAYOUT.gutter;
	const leaderLength = MARKER_DIAMETER * 1.5;
	const labelHeight = frame.h / 2 - MARKER_DIAMETER / 2 - leaderLength - RENDER_LAYOUT.labelGap;
	if (labelHeight <= 0 || labelWidth <= 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "타임라인 레이블을 배치할 여백이 부족합니다.");
	}

	const markerBoundsList: Rect[] = [];
	for (const [index] of input.events.entries()) {
		const centerX = frame.x + slotWidth * (index + 0.5);
		const markerBounds: Rect = {
			x: centerX - MARKER_DIAMETER / 2,
			y: axisY - MARKER_DIAMETER / 2,
			w: MARKER_DIAMETER,
			h: MARKER_DIAMETER,
		};
		markerBoundsList.push(markerBounds);
		builder.shape(`marker-${index}`, markerBounds, "ellipse", TOKENS.colors.primary, TOKENS.colors.primary);
	}

	const labelBoundsList: Rect[] = [];
	for (const [index, event] of input.events.entries()) {
		const marker = markerBoundsList[index];
		if (!marker) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", "타임라인 마커 배치를 계산할 수 없습니다.");
		}
		const above = index % 2 === 0;
		const centerX = marker.x + marker.w / 2;
		const labelBounds: Rect = {
			x: centerX - labelWidth / 2,
			y: above ? marker.y - leaderLength - labelHeight : marker.y + marker.h + leaderLength,
			w: labelWidth,
			h: labelHeight,
		};
		labelBoundsList.push(labelBounds);
		builder.shape(`label-block-${index}`, labelBounds, "roundRect", TOKENS.colors.sectionNumber, TOKENS.colors.line);
		const hasDetail = event.detail !== undefined;
		builder.text(
			`label-${index}`,
			{
				x: labelBounds.x,
				y: labelBounds.y + labelHeight * 0.12,
				w: labelWidth,
				h: labelHeight * (hasDetail ? 0.28 : 0.42),
			},
			event.label,
			{ color: TOKENS.colors.navy, bold: true, align: "center", valign: "middle" },
		);
		if (event.detail !== undefined) {
			builder.text(
				`detail-${index}`,
				{ x: labelBounds.x + 0.12, y: labelBounds.y + labelHeight * 0.42, w: labelWidth - 0.24, h: labelHeight * 0.24 },
				event.detail,
				{ fontSize: RENDER_TYPE_SCALE.caption, color: TOKENS.colors.body, align: "center", valign: "middle" },
			);
		}
		builder.text(
			`date-${index}`,
			{ x: labelBounds.x, y: labelBounds.y + labelHeight * 0.7, w: labelWidth, h: labelHeight * 0.2 },
			event.date,
			{
				fontFace: TOKENS.fonts.heading,
				fontSize: RENDER_TYPE_SCALE.caption,
				color: TOKENS.colors.primary,
				bold: true,
				align: "center",
			},
		);
	}

	for (const [index] of input.events.entries()) {
		const marker = markerBoundsList[index];
		const label = labelBoundsList[index];
		if (!marker || !label) {
			throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "타임라인 인출선을 계산할 수 없습니다.");
		}
		const above = index % 2 === 0;
		builder.connector(
			`leader-${index}`,
			`marker-${index}`,
			`label-block-${index}`,
			above ? { x: marker.x + marker.w / 2, y: marker.y } : { x: marker.x + marker.w / 2, y: marker.y + marker.h },
			above ? { x: label.x + label.w / 2, y: label.y + label.h } : { x: label.x + label.w / 2, y: label.y },
			"none",
		);
	}
	return builder.build();
}
