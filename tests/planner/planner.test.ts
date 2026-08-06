import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { CapacityError, resolveCapacity } from "../../src/planner/capacity.js";
import { normalizeNarrative } from "../../src/planner/normalize.js";
import { planNarrative } from "../../src/planner/plan.js";
import { buildPlannerPrompt } from "../../src/planner/prompt.js";

async function fixture(): Promise<unknown> {
	return JSON.parse(await readFile(new URL("../fixtures/planner/korean-demo.json", import.meta.url), "utf8"));
}

describe("planner narrative normalization", () => {
	test("normalizes a Korean narrative into complete ordered SlideSpecs", async () => {
		const plan = await planNarrative(await fixture());
		expect(plan.title).toBe("KCH 그룹 소개");
		expect(plan.slides.map(({ id, order }) => [String(id), order])).toEqual([
			["overview", 1],
			["pipeline", 2],
		]);
		expect(plan.slides[0]).toMatchObject({
			purpose: "그룹 핵심 역량 소개",
			claim: "KCH는 산업과 에너지를 연결하는 실행 역량을 보유하고 있습니다.",
			visual: { type: "diagram", sourceData: [{ label: "주요 사업", value: 2, unit: "개 영역" }] },
			imageIntent: { action: "none", nativeFallback: "diagram" },
			provenance: [],
			headerSkin: "kch-framed-right",
		});
	});

	test("strips AI coordinates fonts colors and layout fields at the boundary", async () => {
		const input = await fixture();
		const first = (input as { slides: Array<Record<string, unknown>> }).slides[0];
		if (first) {
			first.provenance = [
				{
					source: "openai-api",
					identifier: "model-invented",
					promptHash: null,
					createdAt: "not-a-date",
					licenseStatus: "unknown",
					slideId: "overview",
				},
			];
		}
		const normalized = normalizeNarrative(input);
		const serialized = JSON.stringify(normalized);
		expect(serialized).not.toContain('"layout"');
		expect(serialized).not.toContain('"x"');
		expect(serialized).not.toContain('"font"');
		expect(serialized).not.toContain('"color"');
		expect(normalized.slides[0]?.provenance).toEqual([]);
	});

	test("rejects more than three body blocks", async () => {
		const input = (await fixture()) as { slides: Array<{ bodyBlocks: unknown[] }> };
		input.slides[0]?.bodyBlocks.push({ text: "넷째 블록" }, { text: "다섯째 블록" });
		expect(() => normalizeNarrative(input)).toThrow();
	});

	test("builds prompt data from machine-consumed schema metadata", () => {
		const prompt = JSON.parse(buildPlannerPrompt()) as {
			readonly schema: {
				readonly properties: {
					readonly slides: {
						readonly items: {
							readonly properties: {
								readonly bodyBlocks: { readonly maxItems: number };
							};
						};
					};
				};
			};
		};
		expect(prompt.schema.properties.slides.items.properties.bodyBlocks.maxItems).toBe(3);
	});
});

describe("semantic capacity ladder", () => {
	test.each([
		[
			{ kind: "text", characterCount: 850, maxUnbrokenCharacters: 20, itemCount: 3, splittable: true },
			{ action: "wrap" },
		],
		[
			{ kind: "table", characterCount: 1_100, maxUnbrokenCharacters: 60, itemCount: 16, splittable: true },
			{ action: "alternate-layout", layout: "table-landscape" },
		],
		[
			{ kind: "table", characterCount: 2_000, maxUnbrokenCharacters: 60, itemCount: 30, splittable: true },
			{ action: "split", chunks: 3 },
		],
		[
			{ kind: "text", characterCount: 800, maxUnbrokenCharacters: 20, itemCount: 100, splittable: true },
			{ action: "split", chunks: 10 },
		],
		[
			{ kind: "table", characterCount: 2_000, maxUnbrokenCharacters: 60, itemCount: 5, splittable: true },
			{ action: "split", chunks: 3 },
		],
	] as const)("selects the next deterministic capacity action", (input, expected) => {
		expect(resolveCapacity(input)).toEqual(expected);
	});

	test("throws KCH-E-CAPACITY-001 for an oversized unbreakable table", () => {
		try {
			resolveCapacity({
				kind: "table",
				characterCount: 2_000,
				maxUnbrokenCharacters: 1_200,
				itemCount: 1,
				splittable: false,
			});
			throw new Error("expected capacity failure");
		} catch (error) {
			expect(error).toBeInstanceOf(CapacityError);
			expect((error as CapacityError).code).toBe("KCH-E-CAPACITY-001");
			expect((error as Error).message).toMatch(/[가-힣]/u);
		}
	});

	test("rejects a split that cannot reduce an unbreakable item", () => {
		expect(() =>
			resolveCapacity({
				kind: "table",
				characterCount: 2_000,
				maxUnbrokenCharacters: 1_200,
				itemCount: 5,
				splittable: true,
			}),
		).toThrow(CapacityError);
	});
});
