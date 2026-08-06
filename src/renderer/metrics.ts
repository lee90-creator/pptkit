import type PptxGenJS from "pptxgenjs";

import { resolveCapacity } from "../design-system/capacity.js";
import type { Bounds } from "../design-system/header-skins.js";
import { KCH_TOKENS } from "../design-system/tokens.js";
import {
	CONTENT_REGION,
	type ChartInput,
	type ChartPlan,
	GUTTER,
	RendererError,
	assertWithinContent,
	planChart,
	renderChart,
} from "./charts.js";

export interface KpiCardInput {
	readonly label: string;
	readonly value: number;
	readonly unit?: string;
	readonly caption?: string;
}

export interface KpiCardsInput {
	readonly cards: readonly KpiCardInput[];
	readonly bounds?: Bounds;
}

export interface KpiCardPlan {
	readonly nativeObject: "shape";
	readonly bounds: Bounds;
	readonly labelText: string;
	readonly labelFontFace: string;
	readonly labelFontSize: number;
	readonly valueText: string;
	readonly valueFontFace: string;
	readonly valueFontSize: number;
	readonly fill: string;
	readonly lineColor: string;
	readonly objectName: string;
}

export interface KpiCardsPlan {
	readonly cards: readonly KpiCardPlan[];
	readonly bounds: Bounds;
}

export type KpiCardsDecision =
	| { readonly status: "render"; readonly plan: KpiCardsPlan }
	| { readonly status: "split"; readonly chunks: number };

export interface FinancialDashboardInput {
	readonly cards: readonly KpiCardInput[];
	readonly chart: ChartInput;
}

export interface FinancialDashboardPlan {
	readonly cards: KpiCardsPlan;
	readonly chart: ChartPlan;
}

export type FinancialDashboardDecision =
	| { readonly status: "render"; readonly plan: FinancialDashboardPlan }
	| { readonly status: "alternate-layout"; readonly layout: "horizontal-bar" }
	| { readonly status: "split"; readonly chunks: number };

const MAX_CARDS_PER_ROW = 4;
const CARD_HEIGHT = 5;
const DASHBOARD_CARD_HEIGHT = 108 / 72;
const CARD_LABEL_FONT_SIZE = KCH_TOKENS.fontSizes.bodyMinimum;
const CARD_VALUE_FONT_SIZE = 30;

function formatValue(card: KpiCardInput): string {
	const value = card.value.toLocaleString("ko-KR");
	return card.unit ? `${value}${card.unit.replaceAll(" ", "")}` : value;
}

function longestToken(value: string): number {
	return value.split(/\s+/).reduce((longest, token) => Math.max(longest, token.length), 0);
}

function cardsCapacityChunks(cards: readonly KpiCardInput[]): number | undefined {
	const characterCount = cards.reduce((total, card) => total + card.label.length + formatValue(card).length, 0);
	const maxUnbrokenCharacters = cards.reduce(
		(longest, card) => Math.max(longest, longestToken(card.label), longestToken(formatValue(card))),
		0,
	);
	const decision = resolveCapacity({
		kind: "metric",
		characterCount,
		maxUnbrokenCharacters,
		itemCount: cards.length,
		splittable: cards.length > 1,
	});
	const capacityChunks = decision.action === "split" ? decision.chunks : 1;
	const rowChunks = Math.ceil(cards.length / MAX_CARDS_PER_ROW);
	const chunks = Math.max(capacityChunks, rowChunks);
	return chunks > 1 ? chunks : undefined;
}

export function planKpiCards(input: KpiCardsInput): KpiCardsDecision {
	if (input.cards.length === 0) {
		throw new RendererError("KCH-E-RENDER-METRIC", "KPI 카드가 비어 있습니다.");
	}
	const chunks = cardsCapacityChunks(input.cards);
	if (chunks) {
		return { status: "split", chunks };
	}

	const region = input.bounds ?? CONTENT_REGION;
	const count = input.cards.length;
	const cardWidth = (region.width - GUTTER * (count - 1)) / count;
	const cards = input.cards.map((card, index): KpiCardPlan => {
		const bounds = assertWithinContent(
			{
				x: region.x + index * (cardWidth + GUTTER),
				y: region.y,
				width: cardWidth,
				height: Math.min(CARD_HEIGHT, region.height),
			},
			"KCH-E-RENDER-METRIC",
			`kpi-card-${index + 1}`,
		);
		return {
			nativeObject: "shape",
			bounds,
			labelText: card.caption ? `${card.label} · ${card.caption}` : card.label,
			labelFontFace: KCH_TOKENS.fonts.body,
			labelFontSize: CARD_LABEL_FONT_SIZE,
			valueText: formatValue(card),
			valueFontFace: KCH_TOKENS.fonts.display,
			valueFontSize: CARD_VALUE_FONT_SIZE,
			fill: KCH_TOKENS.colors.sectionNumber,
			lineColor: KCH_TOKENS.colors.line,
			objectName: `KCH-kpi-${index + 1}`,
		};
	});

	return {
		status: "render",
		plan: {
			cards,
			bounds: { x: region.x, y: region.y, width: region.width, height: Math.min(CARD_HEIGHT, region.height) },
		},
	};
}

export function planFinancialDashboard(input: FinancialDashboardInput): FinancialDashboardDecision {
	const cardsRegion = { ...CONTENT_REGION, height: Math.min(DASHBOARD_CARD_HEIGHT, CONTENT_REGION.height) };
	const cards = planKpiCards({ cards: input.cards, bounds: cardsRegion });
	if (cards.status !== "render") {
		return cards;
	}
	const chartTop = cards.plan.bounds.y + cards.plan.bounds.height + GUTTER;
	const chart = planChart({
		...input.chart,
		bounds: {
			x: CONTENT_REGION.x,
			y: chartTop,
			width: CONTENT_REGION.width,
			height: CONTENT_REGION.y + CONTENT_REGION.height - chartTop,
		},
	});
	if (chart.status !== "render") {
		return chart;
	}
	return { status: "render", plan: { cards: cards.plan, chart: chart.plan } };
}

export function renderKpiCards(slide: PptxGenJS.PresSlide, plan: KpiCardsPlan): void {
	for (const card of plan.cards) {
		slide.addShape("roundRect", {
			x: card.bounds.x,
			y: card.bounds.y,
			w: card.bounds.width,
			h: card.bounds.height,
			fill: { color: card.fill },
			line: { color: card.lineColor, width: 0.75 },
			rectRadius: 0.06,
			objectName: `${card.objectName}-panel`,
		});
		slide.addShape("rect", {
			x: card.bounds.x,
			y: card.bounds.y,
			w: card.bounds.width,
			h: 0.08,
			fill: { color: KCH_TOKENS.colors.primary },
			line: { color: KCH_TOKENS.colors.primary, transparency: 100 },
			objectName: `${card.objectName}-accent`,
		});
		slide.addText(card.labelText, {
			x: card.bounds.x + GUTTER,
			y: card.bounds.y + GUTTER / 2,
			w: card.bounds.width - GUTTER * 2,
			h: card.bounds.height * 0.32,
			fontFace: card.labelFontFace,
			fontSize: card.labelFontSize,
			color: KCH_TOKENS.colors.navy,
			margin: 0,
			fit: "shrink",
			objectName: `${card.objectName}-label`,
		});
		slide.addText(card.valueText, {
			x: card.bounds.x + GUTTER,
			y: card.bounds.y + card.bounds.height * 0.34,
			w: card.bounds.width - GUTTER * 2,
			h: card.bounds.height * 0.56,
			fontFace: card.valueFontFace,
			fontSize: card.valueFontSize,
			color: KCH_TOKENS.colors.primary,
			margin: 0,
			fit: "shrink",
			objectName: `${card.objectName}-value`,
		});
		if (card.bounds.height >= 3) {
			slide.addText("2026년 기준", {
				x: card.bounds.x + 0.16,
				y: card.bounds.y + card.bounds.height - 0.56,
				w: card.bounds.width - 0.32,
				h: 0.28,
				fontFace: KCH_TOKENS.fonts.body,
				fontSize: KCH_TOKENS.fontSizes.tableMinimum,
				color: KCH_TOKENS.colors.brandGray,
				margin: 0,
				fit: "shrink",
				objectName: `${card.objectName}-detail`,
			});
		}
	}
}

export function renderFinancialDashboard(slide: PptxGenJS.PresSlide, plan: FinancialDashboardPlan): void {
	renderKpiCards(slide, plan.cards);
	renderChart(slide, plan.chart);
}
