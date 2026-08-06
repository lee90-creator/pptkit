import { expect } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import type {
	ConnectorObject,
	RenderObject,
	RenderPlan,
	ShapeObject,
	TextObject,
} from "../../src/renderer/diagrams.js";
import type { renderPlan } from "../../src/renderer/diagrams.js";

export const CANVAS = KCH_TOKENS.canvas;
export const EPSILON = 1e-6;

export interface RecordedCall {
	readonly method: "addShape" | "addText" | "addImage";
	readonly shapeName?: string;
	readonly options: Record<string, unknown>;
}

export interface SlideRecorder {
	readonly calls: readonly RecordedCall[];
	readonly slide: Parameters<typeof renderPlan>[0];
}

export function createSlideRecorder(): SlideRecorder {
	const calls: RecordedCall[] = [];
	const slide = {
		addShape(shapeName: string, options: Record<string, unknown>) {
			calls.push({ method: "addShape", shapeName, options });
			return slide;
		},
		addText(_text: unknown, options: Record<string, unknown>) {
			calls.push({ method: "addText", options });
			return slide;
		},
		addImage(options: Record<string, unknown>) {
			calls.push({ method: "addImage", options });
			return slide;
		},
	};
	return { calls, slide: slide as unknown as Parameters<typeof renderPlan>[0] };
}

export function objectsOfKind<T extends RenderObject["object"]>(
	plan: RenderPlan,
	object: T,
): readonly Extract<RenderObject, { object: T }>[] {
	return plan.objects.filter((item): item is Extract<RenderObject, { object: T }> => item.object === object);
}

export function connectors(plan: RenderPlan): readonly ConnectorObject[] {
	return objectsOfKind(plan, "connector");
}

export function shapes(plan: RenderPlan): readonly ShapeObject[] {
	return objectsOfKind(plan, "shape");
}

export function texts(plan: RenderPlan): readonly TextObject[] {
	return objectsOfKind(plan, "text");
}

export function boundsOf(plan: RenderPlan, id: string): { x: number; y: number; w: number; h: number } {
	const found = plan.objects.find((item) => item.id === id);
	if (!found) {
		throw new Error(`missing object: ${id}`);
	}
	return found.bounds;
}

export function anchorPoints(bounds: { x: number; y: number; w: number; h: number }): readonly {
	x: number;
	y: number;
}[] {
	return [
		{ x: bounds.x + bounds.w / 2, y: bounds.y },
		{ x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h },
		{ x: bounds.x, y: bounds.y + bounds.h / 2 },
		{ x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 },
	];
}

export function touchesAnchor(
	point: { readonly x: number; readonly y: number },
	bounds: { x: number; y: number; w: number; h: number },
): boolean {
	return anchorPoints(bounds).some(
		(anchor) => Math.abs(anchor.x - point.x) <= EPSILON && Math.abs(anchor.y - point.y) <= EPSILON,
	);
}

export function expectConnectedEndpoints(plan: RenderPlan): void {
	const connectorList = connectors(plan);
	expect(connectorList.length).toBeGreaterThan(0);
	for (const connector of connectorList) {
		const from = boundsOf(plan, connector.fromId);
		const to = boundsOf(plan, connector.toId);
		expect(touchesAnchor(connector.start, from)).toBe(true);
		expect(touchesAnchor(connector.end, to)).toBe(true);
	}
}

export function expectInsideCanvas(plan: RenderPlan): void {
	for (const item of plan.objects) {
		expect(item.bounds.x).toBeGreaterThanOrEqual(-EPSILON);
		expect(item.bounds.y).toBeGreaterThanOrEqual(-EPSILON);
		expect(item.bounds.x + item.bounds.w).toBeLessThanOrEqual(CANVAS.width + EPSILON);
		expect(item.bounds.y + item.bounds.h).toBeLessThanOrEqual(CANVAS.height + EPSILON);
	}
}

export function expectStableZOrder(plan: RenderPlan): void {
	const order = plan.objects.map((item) => item.zOrder);
	expect(order).toEqual([...order].sort((a, b) => a - b));
	expect(new Set(order).size).toBe(order.length);
}

export function expectDesignSystemText(plan: RenderPlan): void {
	const allowedFonts = new Set<string>(Object.values(KCH_TOKENS.fonts));
	const allowedColors = new Set<string>(Object.values(KCH_TOKENS.colors));
	for (const text of texts(plan)) {
		expect(allowedFonts.has(text.fontFace)).toBe(true);
		expect(allowedColors.has(text.color)).toBe(true);
		expect(text.fontSize).toBeGreaterThanOrEqual(KCH_TOKENS.fontSizes.footnoteMinimum);
		expect(text.text.length).toBeGreaterThan(0);
	}
	for (const shape of shapes(plan)) {
		expect(allowedColors.has(shape.fill ?? KCH_TOKENS.colors.background)).toBe(true);
		expect(allowedColors.has(shape.line.color)).toBe(true);
	}
}

export function expectNativePlan(plan: RenderPlan): void {
	expectInsideCanvas(plan);
	expectStableZOrder(plan);
	expectDesignSystemText(plan);
	expect(plan.objects.length).toBeGreaterThan(0);
	for (const item of plan.objects) {
		expect(["shape", "text", "connector", "image"]).toContain(item.object);
	}
}

export const ORG_CHART_INPUT = {
	nodes: [
		{ id: "root", label: "KCH그룹 회장" },
		{ id: "energy", label: "에너지 부문" },
		{ id: "construction", label: "건설 부문" },
		{ id: "finance", label: "재무 부문" },
	],
	edges: [
		{ from: "root", to: "energy" },
		{ from: "root", to: "construction" },
		{ from: "root", to: "finance" },
	],
} as const;
