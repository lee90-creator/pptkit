import { KCH_TOKENS } from "../design-system/tokens.js";
import type { RendererCorpusKind } from "../schema/visual.js";
import { DiagramRenderError, LAYOUT, TYPE_SCALE } from "./diagram-types.js";
import type {
	ArrowType,
	ImageProvenanceRef,
	NativeShapeName,
	Point,
	Rect,
	RenderFallback,
	RenderObject,
	RenderPlan,
} from "./diagram-types.js";

const TOKENS = KCH_TOKENS;

export function contentFrame(): Rect {
	return {
		x: TOKENS.content.left,
		y: TOKENS.content.top,
		w: TOKENS.canvas.width - TOKENS.content.left - TOKENS.content.right,
		h: TOKENS.canvas.height - TOKENS.content.top - TOKENS.content.bottom,
	};
}

export function anchorTop(bounds: Rect): Point {
	return { x: bounds.x + bounds.w / 2, y: bounds.y };
}

export function anchorBottom(bounds: Rect): Point {
	return { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h };
}

export function anchorLeft(bounds: Rect): Point {
	return { x: bounds.x, y: bounds.y + bounds.h / 2 };
}

export function anchorRight(bounds: Rect): Point {
	return { x: bounds.x + bounds.w, y: bounds.y + bounds.h / 2 };
}

function connectorBounds(start: Point, end: Point): Rect {
	return {
		x: Math.min(start.x, end.x),
		y: Math.min(start.y, end.y),
		w: Math.abs(end.x - start.x),
		h: Math.abs(end.y - start.y),
	};
}

class PlanBuilder {
	private readonly objects: RenderObject[] = [];

	constructor(private readonly kind: RendererCorpusKind) {}

	card(id: string, bounds: Rect, fill: string, lineColor: string): this {
		this.objects.push({
			object: "shape",
			id,
			zOrder: this.objects.length,
			bounds,
			shapeName: "roundRect",
			fill,
			line: { color: lineColor, width: LAYOUT.hairline },
			rectRadius: LAYOUT.cardRadius,
		});
		return this;
	}

	shape(
		id: string,
		bounds: Rect,
		shapeName: Exclude<NativeShapeName, "line">,
		fill: string,
		lineColor: string,
		width: number = LAYOUT.hairline,
	): this {
		this.objects.push({
			object: "shape",
			id,
			zOrder: this.objects.length,
			bounds,
			shapeName,
			fill,
			line: { color: lineColor, width },
		});
		return this;
	}

	text(
		id: string,
		bounds: Rect,
		text: string,
		options: {
			readonly fontFace?: string;
			readonly fontSize?: number;
			readonly color?: string;
			readonly bold?: boolean;
			readonly align?: "left" | "center";
			readonly valign?: "top" | "middle";
		} = {},
	): this {
		this.objects.push({
			object: "text",
			id,
			zOrder: this.objects.length,
			bounds,
			text,
			fontFace: options.fontFace ?? TOKENS.fonts.body,
			fontSize: options.fontSize ?? TYPE_SCALE.body,
			color: options.color ?? TOKENS.colors.body,
			bold: options.bold ?? false,
			align: options.align ?? "left",
			valign: options.valign ?? "middle",
		});
		return this;
	}

	connector(
		id: string,
		fromId: string,
		toId: string,
		start: Point,
		end: Point,
		endArrowType: ArrowType = "triangle",
	): this {
		this.objects.push({
			object: "connector",
			id,
			zOrder: this.objects.length,
			bounds: connectorBounds(start, end),
			shapeName: "line",
			fromId,
			toId,
			start,
			end,
			line: { color: TOKENS.colors.primary, width: LAYOUT.connector },
			endArrowType,
		});
		return this;
	}

	image(id: string, bounds: Rect, path: string, altText: string, provenance: ImageProvenanceRef): this {
		this.objects.push({
			object: "image",
			id,
			zOrder: this.objects.length,
			bounds,
			path,
			altText,
			provenance,
		});
		return this;
	}

	build(fallback?: RenderFallback): RenderPlan {
		assertWithinCanvas(this.objects);
		return fallback ? { kind: this.kind, objects: this.objects, fallback } : { kind: this.kind, objects: this.objects };
	}
}

const CANVAS_EPSILON = 1e-9;

function assertWithinCanvas(objects: readonly RenderObject[]): void {
	for (const item of objects) {
		const { x, y, w, h } = item.bounds;
		if (
			x < -CANVAS_EPSILON ||
			y < -CANVAS_EPSILON ||
			x + w > TOKENS.canvas.width + CANVAS_EPSILON ||
			y + h > TOKENS.canvas.height + CANVAS_EPSILON
		) {
			throw new DiagramRenderError("KCH-E-RENDER-BOUNDS", `객체 ${item.id}이(가) 슬라이드 경계를 벗어났습니다.`);
		}
	}
}

export function createPlanBuilder(kind: RendererCorpusKind): PlanBuilder {
	return new PlanBuilder(kind);
}

export function splitColumns(frame: Rect, count: number, gutter: number = LAYOUT.gutter): readonly Rect[] {
	const totalGutter = gutter * (count - 1);
	const columnWidth = (frame.w - totalGutter) / count;
	return Array.from({ length: count }, (_value, index) => ({
		x: frame.x + index * (columnWidth + gutter),
		y: frame.y,
		w: columnWidth,
		h: frame.h,
	}));
}
