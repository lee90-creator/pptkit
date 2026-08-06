import { KCH_TOKENS } from "../design-system/tokens.js";
import {
	anchorBottom,
	anchorLeft,
	anchorRight,
	anchorTop,
	contentFrame,
	createPlanBuilder,
	splitColumns,
} from "./diagram-layout.js";
import { DiagramRenderError, LAYOUT } from "./diagram-types.js";
import type { Rect, RenderPlan } from "./diagram-types.js";

const TOKENS = KCH_TOKENS;

export interface DiagramNode {
	readonly id: string;
	readonly label: string;
}

export interface DiagramEdge {
	readonly from: string;
	readonly to: string;
}

export interface OrgChartInput {
	readonly nodes: readonly DiagramNode[];
	readonly edges: readonly DiagramEdge[];
}

export function buildOrgChartPlan(input: OrgChartInput): RenderPlan {
	const ids = new Set(input.nodes.map((node) => node.id));
	if (ids.size !== input.nodes.length) {
		throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "조직도 노드 식별자가 중복되었습니다.");
	}
	for (const edge of input.edges) {
		if (!ids.has(edge.from) || !ids.has(edge.to)) {
			throw new DiagramRenderError(
				"KCH-E-RENDER-CONNECTOR",
				`연결선 ${edge.from}→${edge.to}의 끝점이 선언된 노드가 아닙니다.`,
			);
		}
	}
	const childIds = new Set(input.edges.map((edge) => edge.to));
	const roots = input.nodes.filter((node) => !childIds.has(node.id));
	const root = roots[0];
	if (!root || roots.length !== 1) {
		throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "조직도에는 정확히 하나의 최상위 노드가 필요합니다.");
	}
	const children = input.nodes.filter((node) => node.id !== root.id);
	if (children.length > LAYOUT.maxCardsPerRow) {
		throw new DiagramRenderError(
			"KCH-E-RENDER-CAPACITY",
			`조직도 하위 노드가 ${LAYOUT.maxCardsPerRow}개를 초과했습니다.`,
		);
	}

	const frame = contentFrame();
	const builder = createPlanBuilder("org-chart");
	const rootWidth = frame.w / 3;
	const rootBounds: Rect = {
		x: frame.x + (frame.w - rootWidth) / 2,
		y: frame.y,
		w: rootWidth,
		h: LAYOUT.nodeHeight,
	};
	builder.card(root.id, rootBounds, TOKENS.colors.primary, TOKENS.colors.primary);
	builder.text(`${root.id}-label`, rootBounds, root.label, {
		fontFace: TOKENS.fonts.heading,
		color: TOKENS.colors.background,
		bold: true,
		align: "center",
	});

	const childRow: Rect = {
		x: frame.x,
		y: frame.y + frame.h - LAYOUT.nodeHeight,
		w: frame.w,
		h: LAYOUT.nodeHeight,
	};
	const columns = splitColumns(childRow, Math.max(children.length, 1));
	const boundsById = new Map<string, Rect>([[root.id, rootBounds]]);
	for (const [index, child] of children.entries()) {
		const column = columns[index];
		if (!column) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", "조직도 열 배치를 계산할 수 없습니다.");
		}
		boundsById.set(child.id, column);
		builder.card(child.id, column, TOKENS.colors.background, TOKENS.colors.line);
		builder.text(`${child.id}-label`, column, child.label, {
			fontFace: TOKENS.fonts.body,
			color: TOKENS.colors.navy,
			align: "center",
		});
	}

	for (const [index, edge] of input.edges.entries()) {
		const from = boundsById.get(edge.from);
		const to = boundsById.get(edge.to);
		if (!from || !to) {
			throw new DiagramRenderError(
				"KCH-E-RENDER-CONNECTOR",
				`연결선 ${edge.from}→${edge.to}을(를) 배치할 수 없습니다.`,
			);
		}
		builder.connector(`edge-${index}`, edge.from, edge.to, anchorBottom(from), anchorTop(to));
	}
	return builder.build();
}

export interface HubSpokeInput {
	readonly hub: DiagramNode;
	readonly spokes: readonly DiagramNode[];
}

export function buildHubSpokePlan(input: HubSpokeInput): RenderPlan {
	if (input.spokes.length === 0) {
		throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", "허브 다이어그램에는 최소 한 개의 스포크가 필요합니다.");
	}
	if (input.spokes.length > LAYOUT.maxHubSpokes) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", `허브 스포크가 ${LAYOUT.maxHubSpokes}개를 초과했습니다.`);
	}

	const frame = contentFrame();
	const builder = createPlanBuilder("hub-spoke");
	const centerX = frame.x + frame.w / 2;
	const centerY = frame.y + frame.h / 2;
	const hubDiameter = Math.min(frame.h, frame.w) / 2.6;
	const hubBounds: Rect = {
		x: centerX - hubDiameter / 2,
		y: centerY - hubDiameter / 2,
		w: hubDiameter,
		h: hubDiameter,
	};
	builder.shape(input.hub.id, hubBounds, "ellipse", TOKENS.colors.primary, TOKENS.colors.primary);
	builder.text(`${input.hub.id}-label`, hubBounds, input.hub.label, {
		fontFace: TOKENS.fonts.heading,
		color: TOKENS.colors.background,
		bold: true,
		align: "center",
	});

	const spokeWidth = frame.w / 5;
	const spokeHeight = LAYOUT.nodeHeight;
	const radiusX = frame.w / 2 - spokeWidth / 2;
	const radiusY = frame.h / 2 - spokeHeight / 2;
	const spokeBounds: Rect[] = [];
	for (const [index, spoke] of input.spokes.entries()) {
		const angle = -Math.PI / 2 + (index * 2 * Math.PI) / input.spokes.length;
		const bounds: Rect = {
			x: centerX + Math.cos(angle) * radiusX - spokeWidth / 2,
			y: centerY + Math.sin(angle) * radiusY - spokeHeight / 2,
			w: spokeWidth,
			h: spokeHeight,
		};
		spokeBounds.push(bounds);
		builder.card(spoke.id, bounds, TOKENS.colors.background, TOKENS.colors.line);
		builder.text(`${spoke.id}-label`, bounds, spoke.label, {
			color: TOKENS.colors.navy,
			align: "center",
		});
	}

	for (const [index, spoke] of input.spokes.entries()) {
		const bounds = spokeBounds[index];
		if (!bounds) {
			throw new DiagramRenderError("KCH-E-RENDER-CONNECTOR", `스포크 ${spoke.id}의 배치를 계산할 수 없습니다.`);
		}
		const spokeCenterX = bounds.x + bounds.w / 2;
		const spokeCenterY = bounds.y + bounds.h / 2;
		const horizontalDominant = Math.abs(spokeCenterX - centerX) >= Math.abs(spokeCenterY - centerY);
		const start = horizontalDominant
			? spokeCenterX >= centerX
				? anchorRight(hubBounds)
				: anchorLeft(hubBounds)
			: spokeCenterY >= centerY
				? anchorBottom(hubBounds)
				: anchorTop(hubBounds);
		const end = horizontalDominant
			? spokeCenterX >= centerX
				? anchorLeft(bounds)
				: anchorRight(bounds)
			: spokeCenterY >= centerY
				? anchorTop(bounds)
				: anchorBottom(bounds);
		builder.connector(`spoke-edge-${index}`, input.hub.id, spoke.id, start, end);
	}
	return builder.build();
}
