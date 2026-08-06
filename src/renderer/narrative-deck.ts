import PptxGenJS from "pptxgenjs";

import { buildHeaderSkin, renderHeaderSkin } from "../design-system/header-skins.js";
import type { HeaderAssets } from "../design-system/header-skins.js";
import { resolveHeaderSkin, resolvePanorama } from "../design-system/modes.js";
import { KCH_TOKENS } from "../design-system/tokens.js";
import type { AtomicPptxResult } from "../io/atomic-output.js";
import { writeAtomicPptx } from "../io/atomic-output.js";
import type { SlideSpecDocument } from "../planner/normalize.js";
import { renderNarrativeVisual } from "./narrative-visual.js";

export interface WriteNarrativeDeckRequest {
	readonly targetPath: string;
	readonly document: SlideSpecDocument;
	readonly assets: HeaderAssets;
}

function renderClaim(slide: PptxGenJS.PresSlide, claim: string): void {
	slide.addShape("roundRect", {
		x: 0.55,
		y: 1.48,
		w: 12.2,
		h: 0.58,
		rectRadius: 0.04,
		fill: { color: KCH_TOKENS.colors.sectionNumber },
		line: { color: KCH_TOKENS.colors.sectionNumber, transparency: 100 },
		objectName: "KCH-key-claim",
	});
	slide.addText(claim, {
		x: 0.76,
		y: 1.61,
		w: 11.78,
		h: 0.3,
		fontFace: KCH_TOKENS.fonts.heading,
		fontSize: 17,
		color: KCH_TOKENS.colors.navy,
		bold: true,
		margin: 0,
		fit: "shrink",
	});
}

function renderBodyBlocks(slide: PptxGenJS.PresSlide, document: SlideSpecDocument, index: number): void {
	const entry = document.slides[index];
	if (!entry) return;
	const hasBody = entry.bodyBlocks.length > 0;
	const hasVisualData = (entry.visual.sourceData?.length ?? 0) > 0;
	const bodyWidth = hasBody ? (hasVisualData ? 4.05 : 12.2) : 0;
	const bodyX = 0.55;
	const bodyY = 2.24;
	const bodyHeight = 4.6;
	if (hasBody) {
		const gap = 0.14;
		const height = (bodyHeight - gap * Math.max(entry.bodyBlocks.length - 1, 0)) / entry.bodyBlocks.length;
		for (const [blockIndex, block] of entry.bodyBlocks.entries()) {
			const y = bodyY + blockIndex * (height + gap);
			slide.addShape("roundRect", {
				x: bodyX,
				y,
				w: bodyWidth,
				h: height,
				rectRadius: 0.04,
				fill: { color: KCH_TOKENS.colors.background },
				line: { color: KCH_TOKENS.colors.line, pt: 1 },
				objectName: `KCH-body-${blockIndex + 1}`,
			});
			if (block.title) {
				slide.addText(block.title, {
					x: bodyX + 0.2,
					y: y + 0.16,
					w: bodyWidth - 0.4,
					h: 0.32,
					fontFace: KCH_TOKENS.fonts.heading,
					fontSize: 15,
					color: KCH_TOKENS.colors.primary,
					bold: true,
					margin: 0,
					fit: "shrink",
				});
			}
			slide.addText(block.text, {
				x: bodyX + 0.2,
				y: y + (block.title ? 0.56 : 0.2),
				w: bodyWidth - 0.4,
				h: height - (block.title ? 0.72 : 0.4),
				fontFace: KCH_TOKENS.fonts.body,
				fontSize: 16,
				color: KCH_TOKENS.colors.body,
				margin: 0,
				breakLine: false,
				fit: "shrink",
				valign: "mid",
			});
		}
	}
	if (hasVisualData) {
		renderNarrativeVisual(slide, entry, {
			x: hasBody ? 4.82 : 0.55,
			y: bodyY,
			width: hasBody ? 7.93 : 12.2,
			height: bodyHeight,
		});
	}
}

export async function writeNarrativeDeck(request: WriteNarrativeDeckRequest): Promise<AtomicPptxResult> {
	return writeAtomicPptx({
		targetPath: request.targetPath,
		generate: async (temporaryPath) => {
			const presentation = new PptxGenJS();
			presentation.layout = "LAYOUT_WIDE";
			presentation.author = "KCH";
			presentation.company = "KCH";
			presentation.title = request.document.title;
			presentation.subject = request.document.purpose;
			for (const [index, entry] of request.document.slides.entries()) {
				const slide = presentation.addSlide();
				slide.background = { color: KCH_TOKENS.colors.background };
				const skin = resolveHeaderSkin(request.document.mode, entry.headerSkin);
				const usePanorama = resolvePanorama(request.document.mode, entry.usePanorama);
				renderHeaderSkin(
					slide,
					buildHeaderSkin({
						skin,
						title: entry.title,
						sectionNumber: String(index + 1).padStart(2, "0"),
						pageNumber: String(index + 1).padStart(2, "0"),
						usePanorama,
					}),
					request.assets,
				);
				renderClaim(slide, entry.claim);
				renderBodyBlocks(slide, request.document, index);
			}
			await presentation.writeFile({ fileName: temporaryPath });
		},
	});
}
