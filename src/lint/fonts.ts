import { KCH_TOKENS } from "../design-system/tokens.js";
import type { LintIssue, SlideLintInput } from "./report.js";

const ALLOWED_FONTS = new Set<string>(Object.values(KCH_TOKENS.fonts));

function minimumFontSize(role: string): number {
	if (role === "footnote") {
		return KCH_TOKENS.fontSizes.footnoteMinimum;
	}
	if (role === "table-cell") {
		return KCH_TOKENS.fontSizes.tableMinimum;
	}
	return KCH_TOKENS.fontSizes.bodyMinimum;
}

export function lintFonts(slide: SlideLintInput): readonly LintIssue[] {
	const issues: LintIssue[] = [];
	for (const object of slide.objects) {
		if (object.kind !== "text" || object.fontFace === undefined || object.fontSize === undefined) {
			continue;
		}
		if (!ALLOWED_FONTS.has(object.fontFace)) {
			issues.push({
				rule: "font-family",
				slideId: slide.slideId,
				objectId: object.id,
				message: `승인되지 않은 글꼴입니다: ${object.fontFace}`,
			});
		}
		if (object.fontSize < minimumFontSize(object.role)) {
			issues.push({
				rule: "font-size",
				slideId: slide.slideId,
				objectId: object.id,
				message: "객체 글자 크기가 역할별 최소값보다 작습니다.",
			});
		}
	}
	return issues;
}
