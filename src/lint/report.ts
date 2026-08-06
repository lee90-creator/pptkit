import { lintBounds } from "./bounds.js";
import { lintFonts } from "./fonts.js";
import { lintNativeObjects } from "./native-objects.js";
import { lintOverlap } from "./overlap.js";

export type PlannedObjectKind = "chart" | "connector" | "image" | "matrix" | "metric" | "shape" | "table" | "text";
export type NativeObjectKind = "chart" | "image" | "shape" | "table";
export type HeaderSkin = "kch-framed-right" | "shinan-line-left";
export type LintRule =
	| "bounds"
	| "empty-data"
	| "font-family"
	| "font-size"
	| "header-presence"
	| "native-object"
	| "overlap";

export interface ObjectBounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PlannedObject {
	readonly id: string;
	readonly kind: PlannedObjectKind;
	readonly nativeObject: NativeObjectKind;
	readonly bounds: ObjectBounds;
	readonly role: string;
	readonly collisionGroup?: string;
	readonly allowBleed?: boolean;
	readonly fontFace?: string;
	readonly fontSize?: number;
	readonly dataCount?: number;
}

export interface SlideLintInput {
	readonly slideId: string;
	readonly width: number;
	readonly height: number;
	readonly headerSkin: HeaderSkin;
	readonly objects: readonly PlannedObject[];
	readonly requiresHeader?: boolean;
}

export interface LintIssue {
	readonly rule: LintRule;
	readonly slideId: string;
	readonly objectId: string;
	readonly message: string;
}

export interface DeckLintReport {
	readonly blockers: readonly LintIssue[];
}

function lintHeaderPresence(slide: SlideLintInput): readonly LintIssue[] {
	if (slide.requiresHeader === false) {
		return [];
	}
	const roles = new Set(slide.objects.map((object) => object.role));
	if (roles.has("header-title") && roles.has("logo")) {
		return [];
	}
	return [
		{
			rule: "header-presence",
			slideId: slide.slideId,
			objectId: slide.slideId,
			message: `${slide.headerSkin} 헤더의 제목 또는 로고가 없습니다.`,
		},
	];
}

export function lintDeck(slides: readonly SlideLintInput[]): DeckLintReport {
	const blockers = slides.flatMap((slide) => [
		...lintBounds(slide),
		...lintOverlap(slide),
		...lintFonts(slide),
		...lintNativeObjects(slide),
		...lintHeaderPresence(slide),
	]);
	return { blockers };
}
