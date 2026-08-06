import { DesignSystemError } from "./header-skins.js";

export type DocumentMode = "corporate" | "wind-industrial";
export type HeaderSkin = "kch-framed-right" | "shinan-line-left";

const DEFAULT_HEADER_BY_MODE = {
	corporate: "kch-framed-right",
	"wind-industrial": "shinan-line-left",
} as const satisfies Record<DocumentMode, HeaderSkin>;

export function resolveHeaderSkin(mode: DocumentMode, override?: HeaderSkin): HeaderSkin {
	return override ?? DEFAULT_HEADER_BY_MODE[mode];
}

export function resolvePanorama(mode: DocumentMode, requested: boolean): boolean {
	if (mode === "corporate" && requested) {
		throw new DesignSystemError("KCH-E-DESIGN-PANORAMA", "corporate 모드에는 풍력 파노라마를 사용할 수 없습니다.");
	}
	return mode === "wind-industrial" && requested;
}
