import { DesignSystemError } from "./header-skins.js";

export const KCH_TOKENS = {
	canvas: {
		width: 13.333333333333334,
		height: 7.5,
	},
	colors: {
		background: "FFFFFF",
		primary: "1972DA",
		navy: "1E3A5F",
		cyan: "00B0F0",
		line: "C8D8EA",
		blueSoft: "8DBCEB",
		body: "172033",
		sectionNumber: "DDEAF8",
		brandGray: "A6A6A6",
	},
	fonts: {
		display: "Pretendard Black",
		heading: "Pretendard Bold",
		body: "Pretendard Regular",
	},
	fontSizes: {
		header: 21,
		sectionNumber: 50,
		bodyMinimum: 16,
		tableMinimum: 11,
		footnoteMinimum: 9,
	},
	content: {
		left: 30 / 72,
		right: 30 / 72,
		top: 124 / 72,
		bottom: 40 / 72,
	},
} as const;

const ALLOWED_FONTS = new Set<string>(Object.values(KCH_TOKENS.fonts));

export function assertAllowedFont(font: string): string {
	if (!ALLOWED_FONTS.has(font)) {
		throw new DesignSystemError("KCH-E-DESIGN-FONT", `배포가 승인되지 않은 글꼴입니다: ${font}`);
	}
	return font;
}
