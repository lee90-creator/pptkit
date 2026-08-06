import type PptxGenJS from "pptxgenjs";

import { buildHeaderSkin, renderHeaderSkin } from "../design-system/header-skins.js";
import type { HeaderAssets } from "../design-system/header-skins.js";
import { KCH_TOKENS } from "../design-system/tokens.js";
import type { PlannedObject, SlideLintInput } from "../lint/report.js";
import type { RendererCorpusKind } from "../schema/visual.js";
import type { RenderPlan } from "./diagrams.js";
import { renderPlan } from "./diagrams.js";

export interface CorpusSlide {
	readonly kind: RendererCorpusKind;
	readonly title: string;
	readonly lint: SlideLintInput;
	readonly renderBody: (slide: PptxGenJS.PresSlide) => void;
}

function sectionNumberForKind(kind: RendererCorpusKind): string {
	if (kind === "toc") return "00";
	if (["kpi-dashboard", "comparison-cards", "strategy-cards", "org-chart"].includes(kind)) return "01";
	if (["process", "timeline", "mini-gantt"].includes(kind)) return "03";
	return "02";
}

interface CorpusSlideInput {
	readonly kind: RendererCorpusKind;
	readonly title: string;
	readonly bodyObjects: readonly PlannedObject[];
	readonly renderBody: (slide: PptxGenJS.PresSlide) => void;
	readonly requiresHeader?: boolean;
	readonly wind?: boolean;
}

export function plannedObjectsFromRenderPlan(plan: RenderPlan): readonly PlannedObject[] {
	return plan.objects.map((item) => {
		const base = {
			id: item.id,
			bounds: { x: item.bounds.x, y: item.bounds.y, width: item.bounds.w, height: item.bounds.h },
			role: item.object === "text" && item.fontSize < KCH_TOKENS.fontSizes.bodyMinimum ? "footnote" : "body",
			collisionGroup: `native-${item.id}`,
		};
		if (item.object === "text") {
			return {
				...base,
				kind: "text",
				nativeObject: "shape",
				fontFace: item.fontFace,
				fontSize: item.fontSize,
			} as const;
		}
		if (item.object === "image") {
			return { ...base, kind: "image", nativeObject: "image" } as const;
		}
		if (item.object === "connector") {
			return { ...base, kind: "connector", nativeObject: "shape", allowBleed: true } as const;
		}
		return { ...base, kind: "shape", nativeObject: "shape" } as const;
	});
}

function headerObjects(title: string, wind: boolean, kind: RendererCorpusKind): readonly PlannedObject[] {
	const descriptor = buildHeaderSkin({
		skin: wind ? "shinan-line-left" : "kch-framed-right",
		title,
		sectionNumber: sectionNumberForKind(kind),
		usePanorama: wind,
	});
	return descriptor.elements.map((element) => ({
		id: `header-${element.id}`,
		kind: element.id === "title" ? ("text" as const) : element.nativeObject,
		nativeObject: element.nativeObject === "image" ? ("image" as const) : ("shape" as const),
		bounds: element.bounds,
		role:
			element.id === "title"
				? "header-title"
				: element.id === "logo" || element.id === "brandLockup"
					? "logo"
					: element.id,
		collisionGroup: `header-${element.id}`,
		...(element.id === "rightFrame" || element.bounds.y < 0 || element.bounds.height === 0 ? { allowBleed: true } : {}),
		...(element.id === "title" ? { fontFace: KCH_TOKENS.fonts.heading, fontSize: KCH_TOKENS.fontSizes.header } : {}),
	}));
}

export function createCorpusSlide(input: CorpusSlideInput): CorpusSlide {
	const requiresHeader = input.requiresHeader ?? true;
	const wind = input.wind ?? false;
	const header = requiresHeader ? headerObjects(input.title, wind, input.kind) : [];
	return {
		kind: input.kind,
		title: input.title,
		renderBody: input.renderBody,
		lint: {
			slideId: `corpus-${input.kind}`,
			width: KCH_TOKENS.canvas.width,
			height: KCH_TOKENS.canvas.height,
			headerSkin: wind ? "shinan-line-left" : "kch-framed-right",
			objects: [...header, ...input.bodyObjects],
			requiresHeader,
		},
	};
}

export function createDiagramCorpusSlide(
	title: string,
	plan: RenderPlan,
	options: { readonly requiresHeader?: boolean; readonly wind?: boolean } = {},
): CorpusSlide {
	return createCorpusSlide({
		kind: plan.kind,
		title,
		bodyObjects: plannedObjectsFromRenderPlan(plan),
		renderBody: (slide) => renderPlan(slide, plan),
		...options,
	});
}

const SUBTITLE_BY_KIND: Readonly<Record<RendererCorpusKind, string>> = {
	cover: "그룹 소개",
	toc: "발표 순서",
	"section-divider": "그룹 현황",
	"kpi-dashboard": "성장 지표 및 운영 현황",
	"comparison-cards": "운영 구조 전환 방향",
	"strategy-cards": "핵심 성장 전략",
	"org-chart": "그룹 조직 및 역할",
	"specification-table": "주요 설비 제원",
	"data-table": "분기별 경영 실적",
	"matrix-heatmap": "핵심 성과 추이",
	"financial-dashboard": "재무 성과와 추세",
	"hub-spoke": "통합 운영 체계",
	"image-callout": "사업 개요와 실행 기준",
	process: "단계별 추진 절차",
	timeline: "핵심 마일스톤",
	"mini-gantt": "분기별 실행 로드맵",
	closing: "마무리",
};

function renderSubtitleBar(slide: PptxGenJS.PresSlide, kind: RendererCorpusKind): void {
	slide.addShape("rect", {
		x: KCH_TOKENS.content.left,
		y: 1.34,
		w: 0.07,
		h: 0.3,
		fill: { color: KCH_TOKENS.colors.primary },
		line: { color: KCH_TOKENS.colors.primary, transparency: 100 },
		objectName: "KCH-subtitle-accent",
	});
	slide.addText(SUBTITLE_BY_KIND[kind], {
		x: KCH_TOKENS.content.left + 0.14,
		y: 1.31,
		w: 3.2,
		h: 0.36,
		fontFace: KCH_TOKENS.fonts.heading,
		fontSize: 14,
		color: KCH_TOKENS.colors.navy,
		bold: true,
		margin: 0,
		fit: "shrink",
		objectName: "KCH-subtitle-label",
	});
}

function renderStandaloneBrand(slide: PptxGenJS.PresSlide, assets: HeaderAssets): void {
	slide.addImage({
		path: assets.logoPath,
		x: 11.45,
		y: 0.32,
		w: 0.86,
		h: 0.46,
		objectName: "KCH-standalone-logo",
	});
}

export function renderCorpusSlide(
	presentation: PptxGenJS,
	entry: CorpusSlide,
	assets: HeaderAssets,
	pageNumber: number,
): void {
	const slide = presentation.addSlide();
	slide.background = { color: KCH_TOKENS.colors.background };
	if (entry.lint.requiresHeader !== false) {
		const wind = entry.lint.headerSkin === "shinan-line-left";
		renderHeaderSkin(
			slide,
			buildHeaderSkin({
				skin: entry.lint.headerSkin,
				title: entry.title,
				sectionNumber: sectionNumberForKind(entry.kind),
				pageNumber: String(pageNumber).padStart(2, "0"),
				usePanorama: wind,
			}),
			assets,
		);
		renderSubtitleBar(slide, entry.kind);
	} else {
		renderStandaloneBrand(slide, assets);
	}
	entry.renderBody(slide);
}
