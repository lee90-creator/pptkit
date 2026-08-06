import { KCH_TOKENS } from "../design-system/tokens.js";
import { DiagramRenderError, RENDER_LAYOUT, RENDER_TYPE_SCALE, contentFrame, createPlanBuilder } from "./diagrams.js";
import type { ImageProvenanceRef, Rect, RenderFallback, RenderPlan } from "./diagrams.js";

export interface ImageCalloutAsset {
	readonly assetId: string;
	readonly path: string;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly provenance: ImageProvenanceRef;
}

export interface ImageCalloutInput {
	readonly asset: ImageCalloutAsset | undefined;
	readonly alt: string;
	readonly caption: string;
	readonly fallbackReason?: "asset-missing";
}

const TOKENS = KCH_TOKENS;
const CAPTION_HEIGHT = 34 / 72;
const ACCENT_WIDTH = 6 / 72;

function fitContain(frame: Rect, aspectRatio: number): Rect {
	const frameRatio = frame.w / frame.h;
	const width = frameRatio > aspectRatio ? frame.h * aspectRatio : frame.w;
	const height = frameRatio > aspectRatio ? frame.h : frame.w / aspectRatio;
	return {
		x: frame.x + (frame.w - width) / 2,
		y: frame.y + (frame.h - height) / 2,
		w: width,
		h: height,
	};
}

export function buildImageCalloutPlan(input: ImageCalloutInput): RenderPlan {
	const frame = contentFrame();
	const builder = createPlanBuilder("image-callout");
	const captionBounds: Rect = {
		x: frame.x + ACCENT_WIDTH + RENDER_LAYOUT.labelGap,
		y: frame.y + frame.h - CAPTION_HEIGHT,
		w: frame.w - ACCENT_WIDTH - RENDER_LAYOUT.labelGap,
		h: CAPTION_HEIGHT,
	};
	const mediaFrame: Rect = {
		x: frame.x,
		y: frame.y,
		w: frame.w,
		h: frame.h - CAPTION_HEIGHT - RENDER_LAYOUT.labelGap,
	};

	if (!input.asset) {
		const fallback: RenderFallback = {
			applied: true,
			reason: input.fallbackReason ?? "asset-missing",
			code: "KCH-W-RENDER-ASSET",
		};
		builder.card("callout-fallback", mediaFrame, TOKENS.colors.background, TOKENS.colors.line);
		builder.shape(
			"callout-fallback-accent",
			{ x: mediaFrame.x, y: mediaFrame.y, w: mediaFrame.w, h: ACCENT_WIDTH },
			"rect",
			TOKENS.colors.primary,
			TOKENS.colors.primary,
		);
		builder.text(
			"callout-fallback-alt",
			{
				x: mediaFrame.x + RENDER_LAYOUT.gutter,
				y: mediaFrame.y + mediaFrame.h / 2 - 0.3,
				w: mediaFrame.w - RENDER_LAYOUT.gutter * 2,
				h: 0.6,
			},
			input.alt,
			{ fontFace: TOKENS.fonts.heading, color: TOKENS.colors.navy, bold: true, align: "center" },
		);
		builder.shape(
			"callout-accent",
			{ x: frame.x, y: captionBounds.y, w: ACCENT_WIDTH, h: CAPTION_HEIGHT },
			"rect",
			TOKENS.colors.primary,
			TOKENS.colors.primary,
		);
		builder.text("callout-caption", captionBounds, input.caption, {
			fontSize: RENDER_TYPE_SCALE.caption,
			color: TOKENS.colors.body,
		});
		return builder.build(fallback);
	}

	if (
		!Number.isFinite(input.asset.pixelWidth) ||
		!Number.isFinite(input.asset.pixelHeight) ||
		input.asset.pixelWidth <= 0 ||
		input.asset.pixelHeight <= 0
	) {
		throw new DiagramRenderError(
			"KCH-E-RENDER-ASSET",
			`자산 ${input.asset.assetId}의 픽셀 크기가 올바르지 않아 비율을 보존할 수 없습니다.`,
		);
	}

	const aspectRatio = input.asset.pixelWidth / input.asset.pixelHeight;
	const imageBounds =
		aspectRatio > 5
			? {
					x: mediaFrame.x,
					y: mediaFrame.y,
					w: mediaFrame.w,
					h: mediaFrame.w / aspectRatio,
				}
			: fitContain(mediaFrame, aspectRatio);
	builder.image("callout-image", imageBounds, input.asset.path, input.alt, input.asset.provenance);
	if (aspectRatio > 5) {
		const insightTop = imageBounds.y + imageBounds.h + RENDER_LAYOUT.gutter;
		const insightHeight = captionBounds.y - RENDER_LAYOUT.gutter - insightTop;
		const cards = [
			{ value: "28.8MW", label: "계획 용량" },
			{ value: "3단계", label: "핵심 추진 공정" },
			{ value: "2026", label: "실행 기준연도" },
		] as const;
		const cardWidth = (frame.w - RENDER_LAYOUT.gutter * 2) / cards.length;
		for (const [index, card] of cards.entries()) {
			const x = frame.x + index * (cardWidth + RENDER_LAYOUT.gutter);
			builder.card(
				`callout-card-${index}`,
				{ x, y: insightTop, w: cardWidth, h: insightHeight },
				TOKENS.colors.sectionNumber,
				TOKENS.colors.line,
			);
			builder.text(
				`callout-value-${index}`,
				{ x: x + 0.2, y: insightTop + insightHeight * 0.2, w: cardWidth - 0.4, h: insightHeight * 0.34 },
				card.value,
				{
					fontFace: TOKENS.fonts.display,
					fontSize: RENDER_TYPE_SCALE.title + 8,
					color: TOKENS.colors.primary,
					bold: true,
					align: "center",
				},
			);
			builder.text(
				`callout-label-${index}`,
				{ x: x + 0.2, y: insightTop + insightHeight * 0.6, w: cardWidth - 0.4, h: insightHeight * 0.2 },
				card.label,
				{ color: TOKENS.colors.navy, bold: true, align: "center" },
			);
		}
	}
	builder.shape(
		"callout-accent",
		{ x: frame.x, y: captionBounds.y, w: ACCENT_WIDTH, h: CAPTION_HEIGHT },
		"rect",
		TOKENS.colors.primary,
		TOKENS.colors.primary,
	);
	builder.text("callout-caption", captionBounds, input.caption, {
		fontSize: RENDER_TYPE_SCALE.caption,
		color: TOKENS.colors.body,
	});
	return builder.build();
}
