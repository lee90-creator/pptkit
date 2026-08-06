import type { LintIssue, PlannedObjectKind, SlideLintInput } from "./report.js";

const EXPECTED_NATIVE_OBJECT = {
	chart: "chart",
	connector: "shape",
	image: "image",
	matrix: "table",
	metric: "shape",
	shape: "shape",
	table: "table",
	text: "shape",
} as const satisfies Record<PlannedObjectKind, "chart" | "image" | "shape" | "table">;

const DATA_KINDS = new Set<PlannedObjectKind>(["chart", "matrix", "metric", "table"]);

export function lintNativeObjects(slide: SlideLintInput): readonly LintIssue[] {
	const issues: LintIssue[] = [];
	for (const object of slide.objects) {
		if (object.nativeObject !== EXPECTED_NATIVE_OBJECT[object.kind]) {
			issues.push({
				rule: "native-object",
				slideId: slide.slideId,
				objectId: object.id,
				message: `${object.kind} 객체가 편집 가능한 네이티브 형식이 아닙니다.`,
			});
		}
		if (DATA_KINDS.has(object.kind) && (object.dataCount ?? 0) <= 0) {
			issues.push({
				rule: "empty-data",
				slideId: slide.slideId,
				objectId: object.id,
				message: "데이터 시각 객체의 원본 데이터가 비어 있습니다.",
			});
		}
	}
	return issues;
}
