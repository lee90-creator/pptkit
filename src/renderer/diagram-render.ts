import type PptxGenJS from "pptxgenjs";

import { KCH_TOKENS } from "../design-system/tokens.js";
import type { RenderPlan } from "./diagram-types.js";

const TOKENS = KCH_TOKENS;

export function renderPlan(slide: PptxGenJS.PresSlide, plan: RenderPlan): void {
	for (const item of plan.objects) {
		const objectName = `KCH-${item.id}`;
		const { x, y, w, h } = item.bounds;
		if (item.object === "text") {
			slide.addText(item.text, {
				x,
				y,
				w,
				h,
				fontFace: item.fontFace,
				fontSize: item.fontSize,
				color: item.color,
				bold: item.bold,
				align: item.align,
				valign: item.valign,
				margin: 0,
				fit: "shrink",
				objectName,
			});
			continue;
		}
		if (item.object === "image") {
			slide.addImage({
				path: item.path,
				x,
				y,
				w,
				h,
				altText: item.altText,
				objectName,
			});
			continue;
		}
		if (item.object === "connector") {
			slide.addShape("line", {
				x,
				y,
				w,
				h,
				flipH: item.end.x < item.start.x,
				flipV: item.end.y < item.start.y,
				line: {
					color: item.line.color,
					width: item.line.width,
					endArrowType: item.endArrowType,
				},
				objectName,
			});
			continue;
		}
		slide.addShape(item.shapeName, {
			x,
			y,
			w,
			h,
			fill: item.fill ? { color: item.fill } : { color: TOKENS.colors.background, transparency: 100 },
			line: { color: item.line.color, width: item.line.width },
			...(item.rectRadius === undefined ? {} : { rectRadius: item.rectRadius }),
			objectName,
		});
	}
}
