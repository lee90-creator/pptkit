import type PptxGenJS from "pptxgenjs";

import { DesignSystemError } from "./header-skins.js";
import type { HeaderAssets, HeaderSkinDescriptor } from "./header-skins.js";
import { KCH_TOKENS } from "./tokens.js";

const TITLE_RIGHT_EDGE = { "kch-framed-right": 678, "shinan-line-left": 930 } as const;

export function renderHeaderSkin(
	slide: PptxGenJS.PresSlide,
	descriptor: HeaderSkinDescriptor,
	assets: HeaderAssets,
): void {
	for (const element of descriptor.elements) {
		const { x, y, width: w, height: h } = element.bounds;
		if (element.nativeObject === "image") {
			const source =
				element.kind === "logo"
					? { path: assets.logoPath }
					: element.kind === "brandLockup"
						? { path: assets.brandLockupPath }
						: assets.panoramaData
							? { data: assets.panoramaData }
							: undefined;
			if (!source) {
				throw new DesignSystemError("KCH-E-DESIGN-ASSET", "풍력 파노라마 데이터가 필요합니다.");
			}
			if (element.kind === "panorama") {
				const panoramaHeight = KCH_TOKENS.canvas.width / (4397 / 382);
				slide.addImage({
					...source,
					x: 0,
					y: KCH_TOKENS.canvas.height - panoramaHeight,
					w: KCH_TOKENS.canvas.width,
					h: panoramaHeight,
					transparency: 78,
					objectName: `KCH-${element.id}`,
				});
				continue;
			}
			const imageWidth = Math.min(w, h * (458 / 246));
			slide.addImage({ ...source, x, y, w: imageWidth, h, objectName: `KCH-${element.id}` });
			continue;
		}
		if (element.kind === "text") {
			const isSectionNumber = element.id === "sectionNumber";
			const isTitle = element.id === "title";
			const titleColor =
				isTitle && descriptor.skin === "kch-framed-right" ? KCH_TOKENS.colors.primary : KCH_TOKENS.colors.navy;
			const auxiliary = element.id === "breadcrumb" || element.id === "pageNumber";
			slide.addText(element.text ?? "", {
				x,
				y,
				w: isTitle ? TITLE_RIGHT_EDGE[descriptor.skin] / 72 - x : w,
				h,
				fontFace: isSectionNumber
					? KCH_TOKENS.fonts.display
					: auxiliary
						? KCH_TOKENS.fonts.body
						: KCH_TOKENS.fonts.heading,
				fontSize: isSectionNumber ? KCH_TOKENS.fontSizes.sectionNumber : auxiliary ? 10 : KCH_TOKENS.fontSizes.header,
				color: isSectionNumber ? KCH_TOKENS.colors.sectionNumber : auxiliary ? KCH_TOKENS.colors.brandGray : titleColor,
				bold: !isSectionNumber && element.id !== "breadcrumb" && element.id !== "pageNumber",
				align: element.id === "pageNumber" ? "center" : "left",
				margin: 0,
				breakLine: false,
				...(isTitle ? { wrap: false, valign: "middle" as const } : {}),
				fit: "shrink",
				objectName: `KCH-${element.id}`,
			});
			continue;
		}
		if (element.kind === "line") {
			const lineWidth = descriptor.skin === "kch-framed-right" ? KCH_TOKENS.canvas.width - x - 0.11 : w;
			slide.addShape("line", {
				x,
				y,
				w: lineWidth,
				h,
				line: {
					color: descriptor.skin === "kch-framed-right" ? KCH_TOKENS.colors.line : KCH_TOKENS.colors.primary,
					width: descriptor.skin === "kch-framed-right" ? 0.75 : 1.5,
				},
				objectName: `KCH-${element.id}`,
			});
			continue;
		}
		if (element.id === "rightFrame") {
			const barSize = 0.11;
			slide.addShape("rect", {
				x,
				y: 0,
				w,
				h: barSize,
				fill: { color: KCH_TOKENS.colors.primary },
				line: { color: KCH_TOKENS.colors.primary, transparency: 100 },
				objectName: "KCH-rightFrame-top",
			});
			slide.addShape("rect", {
				x: x + w - barSize,
				y: 0,
				w: barSize,
				h: KCH_TOKENS.canvas.height,
				fill: { color: KCH_TOKENS.colors.cyan, transparency: 18 },
				line: { color: KCH_TOKENS.colors.cyan, transparency: 100 },
				objectName: "KCH-rightFrame-right",
			});
			continue;
		}
		slide.addShape("rect", {
			x,
			y,
			w,
			h,
			fill: { color: KCH_TOKENS.colors.primary },
			line: { color: KCH_TOKENS.colors.primary, width: 0 },
			objectName: `KCH-${element.id}`,
		});
	}
}
