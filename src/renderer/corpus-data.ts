import type PptxGenJS from "pptxgenjs";

import type { PlannedObject } from "../lint/report.js";
import { planMatrix, renderMatrix } from "./matrix.js";
import type { MatrixDecision, MatrixPlan } from "./matrix.js";
import { planFinancialDashboard, planKpiCards, renderFinancialDashboard, renderKpiCards } from "./metrics.js";
import type { FinancialDashboardDecision, FinancialDashboardPlan, KpiCardsDecision, KpiCardsPlan } from "./metrics.js";
import { createCorpusSlide } from "./slide.js";
import type { CorpusSlide } from "./slide.js";
import { planTable, renderTable } from "./tables.js";
import type { TableDecision, TablePlan } from "./tables.js";

function bodyObject(
	id: string,
	kind: PlannedObject["kind"],
	nativeObject: PlannedObject["nativeObject"],
	bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
	dataCount: number,
): PlannedObject {
	return {
		id,
		kind,
		nativeObject,
		bounds,
		role: "body",
		collisionGroup: `native-${id}`,
		dataCount,
	};
}

function requireKpi(decision: KpiCardsDecision): KpiCardsPlan {
	if (decision.status !== "render") {
		throw new Error("kpi corpus fixture did not fit.");
	}
	return decision.plan;
}

function requireTable(decision: TableDecision, name: string): TablePlan {
	if (decision.status !== "render") {
		throw new Error(`${name} corpus fixture did not fit.`);
	}
	return decision.plan;
}

function requireMatrix(decision: MatrixDecision): MatrixPlan {
	if (decision.status !== "render") {
		throw new Error("matrix corpus fixture did not fit.");
	}
	return decision.plan;
}

function requireFinancial(decision: FinancialDashboardDecision): FinancialDashboardPlan {
	if (decision.status !== "render") {
		throw new Error("financial dashboard corpus fixture did not fit.");
	}
	return decision.plan;
}

export function buildCorpusDataSlides(): readonly CorpusSlide[] {
	const cards = [
		{ label: "누적 수주", value: 1_284, unit: "억 원" },
		{ label: "가동 설비", value: 46, unit: "기" },
		{ label: "고용 인원", value: 312, unit: "명" },
	] as const;
	const chart = {
		chartType: "bar" as const,
		categories: ["1분기", "2분기", "3분기", "4분기"],
		series: [{ name: "매출", values: [120, 138, 151, 164] }],
		unit: "억 원",
	};
	const kpi = requireKpi(planKpiCards({ cards }));
	const specification = requireTable(
		planTable({
			variant: "specification",
			columns: ["항목", "값", "출처"],
			rows: [
				{ cells: ["정격 출력", "5.56MW", "사양서"] },
				{ cells: ["로터 직경", "158m", "도면"] },
				{ cells: ["허브 높이", "115m", "설계서"] },
				{ cells: ["블레이드", "77m", "제작사"] },
				{ cells: ["설계 수명", "25년", "인증서"] },
				{ cells: ["가동률", "42%", "운영 계획"] },
			],
		}),
		"specification table",
	);
	const data = requireTable(
		planTable({
			variant: "data",
			columns: ["분기", "매출", "영업이익"],
			rows: [
				{ cells: ["1분기", 120, 11] },
				{ cells: ["2분기", 138, 14] },
				{ cells: ["3분기", 151, 17] },
				{ cells: ["4분기", 164, 19] },
				{ cells: ["연간 누계", 573, 61] },
				{ cells: ["차년도 목표", 640, 72] },
			],
			unit: "억 원",
		}),
		"data table",
	);
	const matrix = requireMatrix(
		planMatrix({
			rowLabels: ["안전", "품질", "원가", "공정", "환경"],
			columnLabels: ["1분기", "2분기", "3분기", "4분기"],
			values: [
				[92, 95, 97, 98],
				[88, 90, 94, 96],
				[70, 76, 81, 86],
				[84, 87, 91, 95],
				[79, 83, 89, 93],
			],
			unit: "점",
		}),
	);
	const financial = requireFinancial(planFinancialDashboard({ cards, chart }));

	return [
		createCorpusSlide({
			kind: "kpi-dashboard",
			title: "핵심 지표",
			bodyObjects: kpi.cards.map((card) => bodyObject(card.objectName, "metric", "shape", card.bounds, 1)),
			renderBody: (slide: PptxGenJS.PresSlide) => renderKpiCards(slide, kpi),
		}),
		createCorpusSlide({
			kind: "specification-table",
			title: "설비 사양",
			bodyObjects: [
				bodyObject(specification.objectName, "table", "table", specification.bounds, specification.rows.length),
			],
			renderBody: (slide: PptxGenJS.PresSlide) => renderTable(slide, specification),
		}),
		createCorpusSlide({
			kind: "data-table",
			title: "경영 실적",
			bodyObjects: [bodyObject(data.objectName, "table", "table", data.bounds, data.rows.length)],
			renderBody: (slide: PptxGenJS.PresSlide) => renderTable(slide, data),
		}),
		createCorpusSlide({
			kind: "matrix-heatmap",
			title: "성과 매트릭스",
			bodyObjects: [bodyObject(matrix.objectName, "matrix", "table", matrix.bounds, matrix.rows.length)],
			renderBody: (slide: PptxGenJS.PresSlide) => renderMatrix(slide, matrix),
		}),
		createCorpusSlide({
			kind: "financial-dashboard",
			title: "재무 대시보드",
			bodyObjects: [
				bodyObject(financial.chart.objectName, "chart", "chart", financial.chart.bounds, financial.chart.series.length),
				...financial.cards.cards.map((card) => bodyObject(card.objectName, "metric", "shape", card.bounds, 1)),
			],
			renderBody: (slide: PptxGenJS.PresSlide) => renderFinancialDashboard(slide, financial),
		}),
	];
}
