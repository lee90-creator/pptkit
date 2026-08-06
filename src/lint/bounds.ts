import type { LintIssue, SlideLintInput } from "./report.js";

const EPSILON = 0.001;

export function lintBounds(slide: SlideLintInput): readonly LintIssue[] {
	const issues: LintIssue[] = [];
	for (const object of slide.objects) {
		if (object.allowBleed) {
			continue;
		}
		const { x, y, width, height } = object.bounds;
		if (
			x < -EPSILON ||
			y < -EPSILON ||
			width <= 0 ||
			height <= 0 ||
			x + width > slide.width + EPSILON ||
			y + height > slide.height + EPSILON
		) {
			issues.push({
				rule: "bounds",
				slideId: slide.slideId,
				objectId: object.id,
				message: "객체가 슬라이드 경계를 벗어났습니다.",
			});
		}
	}
	return issues;
}
