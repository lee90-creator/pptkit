import { KCH_TOKENS } from "../design-system/tokens.js";
import { contentFrame, createPlanBuilder } from "./diagram-layout.js";
import { LAYOUT, TYPE_SCALE } from "./diagram-types.js";
import type { Rect, RenderPlan } from "./diagram-types.js";

const TOKENS = KCH_TOKENS;

export interface CoverInput {
	readonly title: string;
	readonly subtitle: string;
	readonly footnote: string;
}

export function buildCoverPlan(input: CoverInput): RenderPlan {
	const builder = createPlanBuilder("cover");
	const frame = contentFrame();
	builder.shape(
		"cover-panel",
		{ x: frame.x + frame.w * 0.72, y: frame.y, w: frame.w * 0.28, h: frame.h },
		"rect",
		TOKENS.colors.sectionNumber,
		TOKENS.colors.sectionNumber,
		0,
	);
	builder.text(
		"cover-panel-label",
		{ x: frame.x + frame.w * 0.755, y: frame.y + frame.h * 0.32, w: frame.w * 0.2, h: 1.4 },
		"KCH\nGROUP",
		{
			fontFace: TOKENS.fonts.display,
			fontSize: TYPE_SCALE.title + 8,
			color: TOKENS.colors.primary,
			bold: true,
			align: "center",
		},
	);
	builder.shape(
		"cover-panel-accent",
		{ x: frame.x + frame.w * 0.72, y: frame.y, w: 0.1, h: frame.h },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
		0,
	);
	const bandHeight = 12 / 72;
	builder.shape(
		"cover-band",
		{ x: frame.x, y: frame.y + frame.h * 0.32, w: frame.w * 0.18, h: bandHeight },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
	);
	builder.text("cover-title", { x: frame.x, y: frame.y + frame.h * 0.36, w: frame.w * 0.78, h: 1.1 }, input.title, {
		fontFace: TOKENS.fonts.display,
		fontSize: TYPE_SCALE.display,
		color: TOKENS.colors.navy,
		bold: true,
		valign: "top",
	});
	builder.text(
		"cover-subtitle",
		{ x: frame.x, y: frame.y + frame.h * 0.36 + 1.1, w: frame.w * 0.78, h: 0.45 },
		input.subtitle,
		{ fontSize: TYPE_SCALE.title, color: TOKENS.colors.primary, valign: "top" },
	);
	builder.text("cover-footnote", { x: frame.x, y: frame.y + frame.h - 0.3, w: frame.w, h: 0.3 }, input.footnote, {
		fontSize: TYPE_SCALE.footnote,
		color: TOKENS.colors.brandGray,
		valign: "middle",
	});
	return builder.build();
}

export interface SectionDividerInput {
	readonly sectionNumber: string;
	readonly title: string;
}

export function buildSectionDividerPlan(input: SectionDividerInput): RenderPlan {
	const builder = createPlanBuilder("section-divider");
	const frame = contentFrame();
	builder.shape(
		"section-panel",
		{ x: frame.x + frame.w * 0.7, y: frame.y, w: frame.w * 0.3, h: frame.h },
		"rect",
		TOKENS.colors.sectionNumber,
		TOKENS.colors.sectionNumber,
		0,
	);
	builder.text(
		"section-panel-label",
		{ x: frame.x + frame.w * 0.74, y: frame.y + frame.h * 0.33, w: frame.w * 0.22, h: 1.4 },
		input.sectionNumber,
		{
			fontFace: TOKENS.fonts.display,
			fontSize: TYPE_SCALE.display + 20,
			color: TOKENS.colors.primary,
			bold: true,
			align: "center",
		},
	);
	const numberBounds: Rect = { x: frame.x, y: frame.y + frame.h * 0.3, w: 2.0, h: 1.3 };
	builder.text("section-number", numberBounds, input.sectionNumber, {
		fontFace: TOKENS.fonts.display,
		fontSize: TYPE_SCALE.sectionNumber,
		color: TOKENS.colors.sectionNumber,
		bold: true,
		valign: "middle",
	});
	builder.shape(
		"section-rule",
		{ x: frame.x, y: frame.y + frame.h * 0.3 + 1.3, w: frame.w * 0.42, h: 2 / 72 },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
	);
	builder.text(
		"section-title",
		{ x: frame.x, y: frame.y + frame.h * 0.3 + 1.3 + LAYOUT.labelGap, w: frame.w * 0.7, h: 0.6 },
		input.title,
		{ fontFace: TOKENS.fonts.heading, fontSize: TYPE_SCALE.title + 6, color: TOKENS.colors.navy, bold: true },
	);
	return builder.build();
}

export interface ClosingInput {
	readonly message: string;
	readonly contact: string;
}

export function buildClosingPlan(input: ClosingInput): RenderPlan {
	const builder = createPlanBuilder("closing");
	const frame = contentFrame();
	builder.text("closing-message", { x: frame.x, y: frame.y + frame.h * 0.34, w: frame.w, h: 1.0 }, input.message, {
		fontFace: TOKENS.fonts.display,
		fontSize: TYPE_SCALE.display,
		color: TOKENS.colors.navy,
		bold: true,
		align: "center",
	});
	builder.shape(
		"closing-rule",
		{ x: frame.x + frame.w / 2 - 0.8, y: frame.y + frame.h * 0.34 + 1.05, w: 1.6, h: 2 / 72 },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
	);
	builder.text(
		"closing-contact",
		{ x: frame.x, y: frame.y + frame.h * 0.34 + 1.05 + LAYOUT.labelGap, w: frame.w, h: 0.4 },
		input.contact,
		{ fontSize: TYPE_SCALE.caption, color: TOKENS.colors.brandGray, align: "center" },
	);
	return builder.build();
}
