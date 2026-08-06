import type { HeaderAssets } from "../design-system/header-skins.js";
import { buildCorpusDataSlides } from "./corpus-data.js";
import {
	buildClosingPlan,
	buildComparisonCardsPlan,
	buildCoverPlan,
	buildHubSpokePlan,
	buildOrgChartPlan,
	buildSectionDividerPlan,
	buildStrategyCardsPlan,
} from "./diagrams.js";
import { buildGanttPlan } from "./gantt.js";
import { buildImageCalloutPlan } from "./image-callout.js";
import type { ImageCalloutAsset } from "./image-callout.js";
import { buildProcessPlan } from "./process.js";
import { createDiagramCorpusSlide } from "./slide.js";
import type { CorpusSlide } from "./slide.js";
import { buildTimelinePlan } from "./timeline.js";
import { buildTocPlan } from "./toc.js";

export interface CorpusAssets extends HeaderAssets {
	readonly imageCallout: ImageCalloutAsset | undefined;
}

function requireKind(slides: readonly CorpusSlide[], kind: CorpusSlide["kind"]): CorpusSlide {
	const slide = slides.find((entry) => entry.kind === kind);
	if (!slide) {
		throw new Error(`Missing corpus data slide: ${kind}`);
	}
	return slide;
}

export function buildCorpusSlides(assets: CorpusAssets): readonly CorpusSlide[] {
	const data = buildCorpusDataSlides();
	return [
		createDiagramCorpusSlide(
			"KCH 그룹 소개",
			buildCoverPlan({ title: "KCH 그룹 소개", subtitle: "2026", footnote: "내부 자료" }),
			{ requiresHeader: false },
		),
		createDiagramCorpusSlide(
			"목차",
			buildTocPlan([
				{ number: "01", title: "그룹 현황" },
				{ number: "02", title: "사업 포트폴리오" },
				{ number: "03", title: "추진 계획" },
			]),
		),
		createDiagramCorpusSlide("그룹 현황", buildSectionDividerPlan({ sectionNumber: "01", title: "그룹 현황" }), {
			requiresHeader: false,
		}),
		requireKind(data, "kpi-dashboard"),
		createDiagramCorpusSlide(
			"현행 및 개선",
			buildComparisonCardsPlan({
				left: {
					id: "as-is",
					title: "현행",
					points: ["개별 발주", "높은 금융비용", "분산된 일정 관리", "운영 데이터 단절"],
				},
				right: {
					id: "to-be",
					title: "개선",
					points: ["통합 발주", "PF 구조 최적화", "전사 공정 통합", "운영 데이터 표준화"],
				},
			}),
		),
		createDiagramCorpusSlide(
			"핵심 전략",
			buildStrategyCardsPlan({
				cards: [
					{ id: "growth", title: "01 성장", body: "해상풍력 EPC 확대\n핵심 권역 수주 기반 강화" },
					{ id: "profit", title: "02 수익", body: "O&M 장기 계약\n반복 매출 구조 확보" },
					{ id: "stable", title: "03 안정", body: "PF 관리 고도화\n리스크 조기 경보 운영" },
				],
			}),
		),
		createDiagramCorpusSlide(
			"조직도",
			buildOrgChartPlan({
				nodes: [
					{ id: "root", label: "KCH그룹" },
					{ id: "energy", label: "에너지" },
					{ id: "construction", label: "건설" },
					{ id: "operation", label: "운영" },
					{ id: "finance-team", label: "금융" },
				],
				edges: [
					{ from: "root", to: "energy" },
					{ from: "root", to: "construction" },
					{ from: "root", to: "operation" },
					{ from: "root", to: "finance-team" },
				],
			}),
		),
		requireKind(data, "specification-table"),
		requireKind(data, "data-table"),
		requireKind(data, "matrix-heatmap"),
		requireKind(data, "financial-dashboard"),
		createDiagramCorpusSlide(
			"통합 플랫폼",
			buildHubSpokePlan({
				hub: { id: "hub", label: "통합 플랫폼" },
				spokes: [
					{ id: "wind", label: "해상풍력" },
					{ id: "epc", label: "EPC" },
					{ id: "finance", label: "금융" },
					{ id: "operation", label: "O&M" },
					{ id: "data", label: "데이터" },
				],
			}),
		),
		createDiagramCorpusSlide(
			"신안 해상풍력",
			buildImageCalloutPlan({
				asset: assets.imageCallout,
				alt: "신안 해상풍력 파노라마",
				caption: "신안 해상풍력 사업",
			}),
			{ wind: true },
		),
		createDiagramCorpusSlide(
			"추진 절차",
			buildProcessPlan({
				steps: [
					{ id: "review", label: "타당성 검토", detail: "수익성 검증" },
					{ id: "permit", label: "인허가", detail: "기관 협의" },
					{ id: "build", label: "시공", detail: "품질 통합" },
					{ id: "operate", label: "운영" },
				],
			}),
		),
		createDiagramCorpusSlide(
			"주요 일정",
			buildTimelinePlan({
				events: [
					{ date: "2024-03", label: "사업 승인", detail: "이사회 의결·PF 구조 확정" },
					{ date: "2025-01", label: "착공", detail: "주요 기자재 발주 완료" },
					{ date: "2026-06", label: "상업 운전", detail: "준공 검수·운영 전환" },
				],
			}),
		),
		createDiagramCorpusSlide(
			"실행 계획",
			buildGanttPlan({
				periods: ["1Q", "2Q", "3Q", "4Q"],
				tasks: [
					{ id: "design", label: "설계", startIndex: 0, spanCount: 2 },
					{ id: "permit", label: "인허가", startIndex: 0, spanCount: 3 },
					{ id: "procure", label: "조달", startIndex: 1, spanCount: 2 },
					{ id: "build", label: "시공", startIndex: 1, spanCount: 3 },
					{ id: "commission", label: "시운전", startIndex: 3, spanCount: 1 },
				],
			}),
		),
		createDiagramCorpusSlide("마무리", buildClosingPlan({ message: "감사합니다", contact: "kch@example.com" }), {
			requiresHeader: false,
		}),
	];
}
