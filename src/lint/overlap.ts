import type { LintIssue, PlannedObject, SlideLintInput } from "./report.js";

function overlaps(first: PlannedObject, second: PlannedObject): boolean {
	const a = first.bounds;
	const b = second.bounds;
	const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
	const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
	return overlapWidth > 0.001 && overlapHeight > 0.001;
}

export function lintOverlap(slide: SlideLintInput): readonly LintIssue[] {
	const issues: LintIssue[] = [];
	for (let firstIndex = 0; firstIndex < slide.objects.length; firstIndex += 1) {
		const first = slide.objects[firstIndex];
		if (!first?.collisionGroup) {
			continue;
		}
		for (let secondIndex = firstIndex + 1; secondIndex < slide.objects.length; secondIndex += 1) {
			const second = slide.objects[secondIndex];
			if (!second || second.collisionGroup !== first.collisionGroup || !overlaps(first, second)) {
				continue;
			}
			issues.push({
				rule: "overlap",
				slideId: slide.slideId,
				objectId: `${first.id}+${second.id}`,
				message: "같은 콘텐츠 충돌 그룹의 객체가 겹칩니다.",
			});
		}
	}
	return issues;
}
