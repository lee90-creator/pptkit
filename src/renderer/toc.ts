import { KCH_TOKENS } from "../design-system/tokens.js";
import { DiagramRenderError, RENDER_LAYOUT, RENDER_TYPE_SCALE, contentFrame, createPlanBuilder } from "./diagrams.js";
import type { RenderPlan } from "./diagrams.js";

export interface TocItem {
	readonly number: string;
	readonly title: string;
}

export function buildTocPlan(items: readonly TocItem[]): RenderPlan {
	if (items.length < 2 || items.length > 6) {
		throw new DiagramRenderError("KCH-E-RENDER-CAPACITY", "목차는 2개 이상 6개 이하의 항목이어야 합니다.");
	}
	const frame = contentFrame();
	const builder = createPlanBuilder("toc");
	const rowHeight = (frame.h - RENDER_LAYOUT.gutter * (items.length - 1)) / items.length;
	for (const [index, item] of items.entries()) {
		const y = frame.y + index * (rowHeight + RENDER_LAYOUT.gutter);
		builder.shape(
			`toc-number-${index}`,
			{ x: frame.x, y, w: 0.75, h: rowHeight },
			"roundRect",
			KCH_TOKENS.colors.primary,
			KCH_TOKENS.colors.primary,
		);
		builder.text(`toc-number-text-${index}`, { x: frame.x, y, w: 0.75, h: rowHeight }, item.number, {
			fontFace: KCH_TOKENS.fonts.heading,
			fontSize: RENDER_TYPE_SCALE.cardTitle,
			color: KCH_TOKENS.colors.background,
			bold: true,
			align: "center",
		});
		builder.text(`toc-title-${index}`, { x: frame.x + 1, y, w: frame.w - 1, h: rowHeight }, item.title, {
			fontFace: KCH_TOKENS.fonts.heading,
			color: KCH_TOKENS.colors.navy,
			bold: true,
		});
	}
	return builder.build();
}
