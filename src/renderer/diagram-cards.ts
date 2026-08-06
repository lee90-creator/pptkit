import { KCH_TOKENS } from "../design-system/tokens.js";
import { contentFrame, createPlanBuilder, splitColumns } from "./diagram-layout.js";
import { DiagramRenderError, LAYOUT, TYPE_SCALE } from "./diagram-types.js";
import type { Rect, RenderPlan } from "./diagram-types.js";

const TOKENS = KCH_TOKENS;

export interface StrategyCard {
	readonly id: string;
	readonly title: string;
	readonly body: string;
}

export interface StrategyCardsInput {
	readonly cards: readonly StrategyCard[];
}

export function buildStrategyCardsPlan(input: StrategyCardsInput): RenderPlan {
	if (input.cards.length === 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "전략 카드가 최소 한 개 필요합니다.");
	}
	if (input.cards.length > LAYOUT.maxCardsPerRow) {
		throw new DiagramRenderError(
			"KCH-E-RENDER-CAPACITY",
			`전략 카드가 한 행 최대 ${LAYOUT.maxCardsPerRow}개를 초과했습니다.`,
		);
	}
	const baseFrame = contentFrame();
	const frame = { ...baseFrame, y: baseFrame.y + 0.35, h: baseFrame.h - 0.7 };
	const builder = createPlanBuilder("strategy-cards");
	const footerHeight = 0.58;
	const cardFrame = { ...frame, h: frame.h - footerHeight - LAYOUT.labelGap };
	const columns = splitColumns(cardFrame, input.cards.length);
	const accentHeight = 6 / 72;
	for (const [index, card] of input.cards.entries()) {
		const column = columns[index];
		if (!column) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", "전략 카드 열 배치를 계산할 수 없습니다.");
		}
		builder.card(`card-${card.id}`, column, TOKENS.colors.background, TOKENS.colors.line);
		builder.shape(
			`card-${card.id}-accent`,
			{ x: column.x, y: column.y, w: column.w, h: accentHeight },
			"rect",
			TOKENS.colors.primary,
			TOKENS.colors.primary,
		);
		const titleBounds: Rect = {
			x: column.x + LAYOUT.gutter / 2,
			y: column.y + accentHeight + LAYOUT.labelGap,
			w: column.w - LAYOUT.gutter,
			h: 40 / 72,
		};
		builder.text(`card-${card.id}-title`, titleBounds, card.title, {
			fontFace: TOKENS.fonts.heading,
			fontSize: TYPE_SCALE.cardTitle,
			color: TOKENS.colors.navy,
			bold: true,
			valign: "top",
		});
		builder.text(
			`card-${card.id}-figure`,
			{ x: titleBounds.x, y: titleBounds.y + titleBounds.h + 0.2, w: titleBounds.w, h: 1.15 },
			String(index + 1).padStart(2, "0"),
			{
				fontFace: TOKENS.fonts.display,
				fontSize: TYPE_SCALE.display + 10,
				color: TOKENS.colors.sectionNumber,
				bold: true,
				align: "center",
			},
		);
		builder.text(
			`card-${card.id}-body`,
			{
				x: titleBounds.x,
				y: titleBounds.y + titleBounds.h + 1.45,
				w: titleBounds.w,
				h: column.y + column.h - (titleBounds.y + titleBounds.h + 1.45) - LAYOUT.labelGap,
			},
			card.body,
			{ valign: "top" },
		);
	}
	builder.shape(
		"strategy-conclusion-rule",
		{ x: frame.x, y: frame.y + frame.h - footerHeight, w: frame.w, h: 2 / 72 },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
		0,
	);
	builder.text(
		"strategy-conclusion",
		{ x: frame.x, y: frame.y + frame.h - footerHeight + 0.08, w: frame.w, h: footerHeight - 0.08 },
		"성장 · 수익 · 안정  ⇒  지속 가능한 사업 포트폴리오",
		{ fontFace: TOKENS.fonts.heading, color: TOKENS.colors.navy, bold: true, align: "center" },
	);
	return builder.build();
}

export interface ComparisonColumn {
	readonly id: string;
	readonly title: string;
	readonly points: readonly string[];
}

export interface ComparisonCardsInput {
	readonly left: ComparisonColumn;
	readonly right: ComparisonColumn;
}

export function buildComparisonCardsPlan(input: ComparisonCardsInput): RenderPlan {
	const baseFrame = contentFrame();
	const frame = { ...baseFrame, y: baseFrame.y + 0.35, h: baseFrame.h - 0.7 };
	const builder = createPlanBuilder("comparison-cards");
	const columns = splitColumns(frame, 2);
	const sides = [
		{ column: input.left, accent: TOKENS.colors.brandGray },
		{ column: input.right, accent: TOKENS.colors.primary },
	] as const;
	for (const [index, side] of sides.entries()) {
		const bounds = columns[index];
		if (!bounds) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", "비교 카드 열 배치를 계산할 수 없습니다.");
		}
		if (side.column.points.length === 0) {
			throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "비교 카드에는 최소 한 개의 항목이 필요합니다.");
		}
		builder.card(`card-${side.column.id}`, bounds, TOKENS.colors.background, TOKENS.colors.line);
		const headerBounds: Rect = { x: bounds.x, y: bounds.y, w: bounds.w, h: 44 / 72 };
		builder.shape(`card-${side.column.id}-header`, headerBounds, "rect", side.accent, side.accent);
		builder.text(`card-${side.column.id}-title`, headerBounds, side.column.title, {
			fontFace: TOKENS.fonts.heading,
			fontSize: TYPE_SCALE.cardTitle,
			color: TOKENS.colors.background,
			bold: true,
			align: "center",
		});
		const listTop = bounds.y + headerBounds.h + LAYOUT.labelGap;
		const rowHeight = (bounds.y + bounds.h - listTop - LAYOUT.labelGap) / side.column.points.length;
		for (const [pointIndex, point] of side.column.points.entries()) {
			builder.text(
				`card-${side.column.id}-point-${pointIndex}`,
				{
					x: bounds.x + LAYOUT.gutter / 2,
					y: listTop + pointIndex * rowHeight,
					w: bounds.w - LAYOUT.gutter,
					h: rowHeight,
				},
				point,
				{ valign: "top" },
			);
		}
	}
	return builder.build();
}
