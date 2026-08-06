import { z } from "zod";

const CapacityInputSchema = z.object({
	kind: z.enum(["text", "chart", "table", "diagram", "process", "timeline", "image", "metric"]),
	characterCount: z.number().int().nonnegative(),
	maxUnbrokenCharacters: z.number().int().nonnegative(),
	itemCount: z.number().int().nonnegative(),
	splittable: z.boolean(),
});

export type CapacityInput = z.infer<typeof CapacityInputSchema>;
export type CapacityDecision =
	| { readonly action: "fit" }
	| { readonly action: "wrap" }
	| { readonly action: "alternate-layout"; readonly layout: "table-landscape" }
	| { readonly action: "split"; readonly chunks: number };

export class CapacityError extends Error {
	readonly code = "KCH-E-CAPACITY-001" as const;

	constructor() {
		super("콘텐츠가 슬라이드 수용 한계를 초과했으며 안전하게 분할할 수 없습니다. 표 또는 본문을 줄여 주세요.");
		this.name = "CapacityError";
	}
}

const MAX_CHARACTERS_PER_SLIDE = 700;
const MAX_ITEMS_PER_SLIDE = 10;
const MAX_WRAPPED_UNBROKEN_CHARACTERS = 40;
const MAX_TABLE_ALTERNATE_UNBROKEN_CHARACTERS = 80;

export function resolveCapacity(rawInput: CapacityInput): CapacityDecision {
	const input = CapacityInputSchema.parse(rawInput);
	if (
		input.characterCount <= MAX_CHARACTERS_PER_SLIDE &&
		input.itemCount <= MAX_ITEMS_PER_SLIDE &&
		input.maxUnbrokenCharacters <= MAX_WRAPPED_UNBROKEN_CHARACTERS
	) {
		return { action: "fit" };
	}
	if (
		input.characterCount <= 900 &&
		input.itemCount <= MAX_ITEMS_PER_SLIDE &&
		input.maxUnbrokenCharacters <= MAX_WRAPPED_UNBROKEN_CHARACTERS
	) {
		return { action: "wrap" };
	}
	if (
		input.kind === "table" &&
		input.characterCount <= 1_200 &&
		input.itemCount <= 18 &&
		input.maxUnbrokenCharacters <= MAX_TABLE_ALTERNATE_UNBROKEN_CHARACTERS
	) {
		return { action: "alternate-layout", layout: "table-landscape" };
	}
	const splitUnbrokenLimit =
		input.kind === "table" ? MAX_TABLE_ALTERNATE_UNBROKEN_CHARACTERS : MAX_WRAPPED_UNBROKEN_CHARACTERS;
	if (input.splittable && input.itemCount > 1 && input.maxUnbrokenCharacters <= splitUnbrokenLimit) {
		const chunks = Math.max(
			2,
			Math.ceil(input.characterCount / MAX_CHARACTERS_PER_SLIDE),
			Math.ceil(input.itemCount / MAX_ITEMS_PER_SLIDE),
		);
		if (chunks <= input.itemCount) {
			return { action: "split", chunks };
		}
	}
	throw new CapacityError();
}
