import { HeaderSkinSchema } from "../schema/slide.js";

export { renderHeaderSkin } from "./header-render.js";

type HeaderSkin = "kch-framed-right" | "shinan-line-left";
type DesignErrorCode = "KCH-E-DESIGN-ASSET" | "KCH-E-DESIGN-FONT" | "KCH-E-DESIGN-HEADER" | "KCH-E-DESIGN-PANORAMA";

export class DesignSystemError extends Error {
	constructor(
		readonly code: DesignErrorCode,
		message: string,
	) {
		super(`${code}: ${message}`);
		this.name = "DesignSystemError";
	}
}

export interface Bounds {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

interface BaseHeaderElement {
	readonly id: string;
	readonly bounds: Bounds;
	readonly nativeObject: "shape" | "image";
}

interface ShapeHeaderElement extends BaseHeaderElement {
	readonly nativeObject: "shape";
	readonly kind: "line" | "rect" | "text";
	readonly text?: string;
}

interface ImageHeaderElement extends BaseHeaderElement {
	readonly nativeObject: "image";
	readonly kind: "brandLockup" | "logo" | "panorama";
}

export type HeaderElement = ShapeHeaderElement | ImageHeaderElement;

export interface HeaderSkinDescriptor {
	readonly skin: HeaderSkin;
	readonly elements: readonly HeaderElement[];
}

export interface BuildHeaderSkinInput {
	readonly skin: HeaderSkin;
	readonly title: string;
	readonly sectionNumber?: string;
	readonly pageNumber?: string;
	readonly usePanorama: boolean;
}

export interface HeaderAssets {
	readonly logoPath: string;
	readonly brandLockupPath: string;
	readonly panoramaData?: string;
}

function pt(x: number, y: number, width: number, height: number): Bounds {
	return {
		x: x / 72,
		y: y / 72,
		width: width / 72,
		height: height / 72,
	};
}

const KCH_ANCHORS = {
	rightFrame: pt(582, -2.465, 378, 366.279),
	topRule: pt(30.687, 70.27, 898.626, 0),
	verticalBand: pt(43.964, -2.465, 19.33, 83.013),
	sectionNumber: pt(66.796, 15.725, 88.254, 87.244),
	title: pt(155.745, 27.763, 161.209, 36.352),
	breadcrumb: pt(690, 28, 110, 15),
	logo: pt(818, 21.603, 111, 33.995),
	pageNumber: pt(895, 510, 30, 15),
} as const;

const SHINAN_ANCHORS = {
	brandLockup: pt(6, 18, 96, 24),
	topRule: pt(352, 54, 578, 0),
	title: pt(363.714, 23.34, 480, 38.775),
	pageNumber: pt(20, 510, 30, 15),
	panorama: pt(0, 492, 960, 48),
} as const;

export function parseHeaderSkin(value: unknown): HeaderSkin {
	const parsed = HeaderSkinSchema.safeParse(value);
	if (!parsed.success) {
		throw new DesignSystemError(
			"KCH-E-DESIGN-HEADER",
			"kch-framed-right 또는 shinan-line-left 헤더만 사용할 수 있습니다.",
		);
	}
	return parsed.data;
}

export function buildHeaderSkin(input: BuildHeaderSkinInput): HeaderSkinDescriptor {
	if (input.skin === "kch-framed-right") {
		if (input.usePanorama) {
			throw new DesignSystemError(
				"KCH-E-DESIGN-PANORAMA",
				"kch-framed-right 헤더에는 풍력 파노라마를 사용할 수 없습니다.",
			);
		}
		return {
			skin: input.skin,
			elements: [
				{ id: "rightFrame", bounds: KCH_ANCHORS.rightFrame, nativeObject: "shape", kind: "rect" },
				{ id: "topRule", bounds: KCH_ANCHORS.topRule, nativeObject: "shape", kind: "line" },
				{ id: "verticalBand", bounds: KCH_ANCHORS.verticalBand, nativeObject: "shape", kind: "rect" },
				{
					id: "sectionNumber",
					bounds: KCH_ANCHORS.sectionNumber,
					nativeObject: "shape",
					kind: "text",
					text: input.sectionNumber ?? "01",
				},
				{ id: "title", bounds: KCH_ANCHORS.title, nativeObject: "shape", kind: "text", text: input.title },
				{
					id: "breadcrumb",
					bounds: KCH_ANCHORS.breadcrumb,
					nativeObject: "shape",
					kind: "text",
					text: "KCH그룹 소개",
				},
				{ id: "logo", bounds: KCH_ANCHORS.logo, nativeObject: "image", kind: "logo" },
				{
					id: "pageNumber",
					bounds: KCH_ANCHORS.pageNumber,
					nativeObject: "shape",
					kind: "text",
					text: input.pageNumber ?? "",
				},
			],
		};
	}

	const elements: HeaderElement[] = [
		{ id: "brandLockup", bounds: SHINAN_ANCHORS.brandLockup, nativeObject: "image", kind: "brandLockup" },
		{ id: "topRule", bounds: SHINAN_ANCHORS.topRule, nativeObject: "shape", kind: "line" },
		{ id: "title", bounds: SHINAN_ANCHORS.title, nativeObject: "shape", kind: "text", text: input.title },
		{
			id: "pageNumber",
			bounds: SHINAN_ANCHORS.pageNumber,
			nativeObject: "shape",
			kind: "text",
			text: input.pageNumber ?? "",
		},
	];
	if (input.usePanorama) {
		elements.push({
			id: "panorama",
			bounds: SHINAN_ANCHORS.panorama,
			nativeObject: "image",
			kind: "panorama",
		});
	}
	return { skin: input.skin, elements };
}
