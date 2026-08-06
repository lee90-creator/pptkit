import { KCH_TOKENS } from "../design-system/tokens.js";
import {
	DiagramRenderError,
	RENDER_LAYOUT,
	RENDER_TYPE_SCALE,
	contentFrame,
	createPlanBuilder,
	splitColumns,
} from "./diagrams.js";
import type { Rect, RenderPlan } from "./diagrams.js";

export interface ProcessStep {
	readonly id: string;
	readonly label: string;
	readonly detail?: string;
}

export interface ProcessInput {
	readonly steps: readonly ProcessStep[];
}

const TOKENS = KCH_TOKENS;

export function buildProcessPlan(input: ProcessInput): RenderPlan {
	if (input.steps.length < 2) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "프로세스에는 최소 두 개의 단계가 필요합니다.");
	}
	if (input.steps.length > RENDER_LAYOUT.maxProcessSteps) {
		throw new DiagramRenderError(
			"KCH-E-RENDER-CAPACITY",
			`프로세스 단계가 한 슬라이드 최대 ${RENDER_LAYOUT.maxProcessSteps}개를 초과했습니다.`,
		);
	}
	const ids = new Set(input.steps.map((step) => step.id));
	if (ids.size !== input.steps.length) {
		throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "프로세스 단계 식별자가 중복되었습니다.");
	}

	const frame = contentFrame();
	const builder = createPlanBuilder("process");
	const bandHeight = frame.h * 0.86;
	const band: Rect = {
		x: frame.x,
		y: frame.y + (frame.h - bandHeight) / 2,
		w: frame.w,
		h: bandHeight,
	};
	const columns = splitColumns(band, input.steps.length);
	const stepBounds: Rect[] = [];

	for (const [index, step] of input.steps.entries()) {
		const column = columns[index];
		if (!column) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", "프로세스 단계 배치를 계산할 수 없습니다.");
		}
		stepBounds.push(column);
		const isLast = index === input.steps.length - 1;
		builder.shape(
			step.id,
			column,
			"chevron",
			isLast ? TOKENS.colors.primary : TOKENS.colors.sectionNumber,
			isLast ? TOKENS.colors.primary : TOKENS.colors.line,
		);
		builder.text(
			`${step.id}-label`,
			{
				x: column.x + column.w * (isLast ? 0.4 : 0.27),
				y: column.y,
				w: column.w * (isLast ? 0.36 : 0.46),
				h: step.detail === undefined ? column.h : column.h * 0.5,
			},
			step.label,
			{
				fontFace: TOKENS.fonts.heading,
				color: isLast ? TOKENS.colors.background : TOKENS.colors.navy,
				bold: true,
				align: "center",
			},
		);
		if (step.detail !== undefined) {
			builder.text(
				`${step.id}-detail`,
				{
					x: column.x + column.w * 0.34,
					y: column.y + column.h * 0.5,
					w: column.w * 0.38,
					h: column.h * 0.42,
				},
				step.detail,
				{
					fontSize: RENDER_TYPE_SCALE.caption,
					color: isLast ? TOKENS.colors.background : TOKENS.colors.body,
					align: "center",
					valign: "top",
				},
			);
		}
	}

	for (let index = 1; index < input.steps.length; index += 1) {
		const previousStep = input.steps[index - 1];
		const currentStep = input.steps[index];
		const previousBounds = stepBounds[index - 1];
		const currentBounds = stepBounds[index];
		if (!previousStep || !currentStep || !previousBounds || !currentBounds) {
			throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "프로세스 연결선을 계산할 수 없습니다.");
		}
		builder.connector(
			`process-edge-${index - 1}`,
			previousStep.id,
			currentStep.id,
			{ x: previousBounds.x + previousBounds.w, y: previousBounds.y + previousBounds.h / 2 },
			{ x: currentBounds.x, y: currentBounds.y + currentBounds.h / 2 },
		);
	}
	return builder.build();
}
