import { KCH_TOKENS } from "../design-system/tokens.js";
import { RendererCorpusKindSchema } from "../schema/visual.js";
import type { RendererCorpusKind } from "../schema/visual.js";

export type DiagramErrorCode =
	| "KCH-E-RENDER-CONNECTOR"
	| "KCH-E-RENDER-CAPACITY"
	| "KCH-E-RENDER-BOUNDS"
	| "KCH-E-RENDER-ASSET";

export class DiagramRenderError extends Error {
	constructor(
		readonly code: DiagramErrorCode,
		message: string,
	) {
		super(`${code}: ${message}`);
		this.name = "DiagramRenderError";
	}
}

export const RENDERER_CORPUS_KINDS = RendererCorpusKindSchema.options;

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
}

export interface Point {
	readonly x: number;
	readonly y: number;
}

export type NativeShapeName = "rect" | "roundRect" | "ellipse" | "chevron" | "line";
export type ArrowType = "none" | "triangle";

interface BaseObject {
	readonly id: string;
	readonly zOrder: number;
	readonly bounds: Rect;
}

export interface ShapeObject extends BaseObject {
	readonly object: "shape";
	readonly shapeName: Exclude<NativeShapeName, "line">;
	readonly fill?: string;
	readonly line: { readonly color: string; readonly width: number };
	readonly rectRadius?: number;
}

export interface ConnectorObject extends BaseObject {
	readonly object: "connector";
	readonly shapeName: "line";
	readonly fromId: string;
	readonly toId: string;
	readonly start: Point;
	readonly end: Point;
	readonly line: { readonly color: string; readonly width: number };
	readonly endArrowType: ArrowType;
}

export interface TextObject extends BaseObject {
	readonly object: "text";
	readonly text: string;
	readonly fontFace: string;
	readonly fontSize: number;
	readonly color: string;
	readonly bold: boolean;
	readonly align: "left" | "center";
	readonly valign: "top" | "middle";
}

export interface ImageProvenanceRef {
	readonly source: "provided" | "reference" | "openai-api" | "codex-extension" | "stock";
	readonly identifier: string;
	readonly licenseStatus: string;
}

export interface ImageObject extends BaseObject {
	readonly object: "image";
	readonly path: string;
	readonly altText: string;
	readonly provenance: ImageProvenanceRef;
}

export type RenderObject = ShapeObject | ConnectorObject | TextObject | ImageObject;

export interface RenderFallback {
	readonly applied: true;
	readonly reason: "asset-missing";
	readonly code: "KCH-W-RENDER-ASSET";
}

export interface RenderPlan {
	readonly kind: RendererCorpusKind;
	readonly objects: readonly RenderObject[];
	readonly fallback?: RenderFallback;
}

const TOKENS = KCH_TOKENS;

export const LAYOUT = {
	gutter: 24 / 72,
	cardRadius: 0.04,
	hairline: 0.75,
	connector: 1.25,
	nodeHeight: 54 / 72,
	labelGap: 10 / 72,
	maxCardsPerRow: 4,
	maxProcessSteps: 6,
	maxTimelineEvents: 8,
	maxHubSpokes: 8,
} as const;

export const TYPE_SCALE = {
	display: 40,
	sectionNumber: TOKENS.fontSizes.sectionNumber,
	title: TOKENS.fontSizes.header,
	cardTitle: 18,
	body: TOKENS.fontSizes.bodyMinimum,
	caption: 12,
	footnote: TOKENS.fontSizes.footnoteMinimum,
} as const;

export const RENDER_LAYOUT = LAYOUT;
export const RENDER_TYPE_SCALE = TYPE_SCALE;
