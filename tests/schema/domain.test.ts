import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { AssetProvenanceSchema } from "../../src/schema/asset.js";
import { BootstrapStepResultSchema, BootstrapStepStateSchema } from "../../src/schema/bootstrap.js";
import { DocumentSchema } from "../../src/schema/document.js";
import { SlideIdSchema } from "../../src/schema/ids.js";
import {
	DomainBoundaryError,
	type DomainErrorCode,
	DomainErrorCodeSchema,
	parseDomainBoundary,
} from "../../src/schema/lint.js";
import { ProviderEnvelopeSchema, ProviderStatusSchema } from "../../src/schema/provider.js";
import { SlideSchema } from "../../src/schema/slide.js";
import { RendererCorpusKindSchema, VisualSchema } from "../../src/schema/visual.js";

async function fixture(name: string): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(new URL(`../fixtures/schema/${name}.json`, import.meta.url), "utf8"));
}

describe("exhaustive domain contracts", () => {
	test("parses all semantic visual variants and core boundaries", async () => {
		const valid = await fixture("valid-domain");
		const document = DocumentSchema.parse(valid.document);
		expect(new Set(document.slides.map(({ visual }) => visual.type))).toEqual(
			new Set(["chart", "table", "diagram", "process", "timeline", "image", "metric", "text"]),
		);
		expect(ProviderEnvelopeSchema.parse(valid.providerEnvelope).state).toBe("authenticated");
		expect(BootstrapStepResultSchema.parse(valid.bootstrapResult).state).toBe("SKIP");
		expect(String(SlideIdSchema.parse("slide-valid"))).toBe("slide-valid");
		expect(ProviderStatusSchema.options).toEqual(["authenticated", "installed-unauthenticated", "missing", "unusable"]);
		expect(BootstrapStepStateSchema.options).toEqual(["CHECK", "INSTALL", "SKIP", "WARN", "BLOCKED"]);
		expect(RendererCorpusKindSchema.options).toEqual([
			"cover",
			"toc",
			"section-divider",
			"kpi-dashboard",
			"comparison-cards",
			"strategy-cards",
			"org-chart",
			"specification-table",
			"data-table",
			"matrix-heatmap",
			"financial-dashboard",
			"hub-spoke",
			"image-callout",
			"process",
			"timeline",
			"mini-gantt",
			"closing",
		]);
		expect(DomainErrorCodeSchema.options).toContain("KCH-E-SCHEMA-001");
	});

	test("parses every provider and bootstrap state variant", () => {
		for (const state of ["authenticated", "installed-unauthenticated", "unusable"] as const) {
			expect(ProviderEnvelopeSchema.parse({ provider: "claude", state, executable: "claude.exe" }).state).toBe(state);
		}
		expect(ProviderEnvelopeSchema.parse({ provider: "codex", state: "missing" }).state).toBe("missing");
		for (const state of ["CHECK", "INSTALL", "SKIP", "WARN"] as const) {
			expect(BootstrapStepResultSchema.parse({ id: "step", state, supportTier: "A", message: "정상 상태" }).state).toBe(
				state,
			);
		}
		expect(
			BootstrapStepResultSchema.parse({
				id: "step",
				state: "BLOCKED",
				supportTier: "C",
				message: "정책 차단",
				path: "C:\\KCH\\payload.zip",
				sha256: "a".repeat(64),
				itAction: "IT 담당자에게 허용을 요청하세요.",
			}).state,
		).toBe("BLOCKED");
	});

	test("requires an explicit support tier on every bootstrap result", () => {
		expect(() =>
			BootstrapStepResultSchema.parse({
				id: "step",
				state: "SKIP",
				message: "이미 설치됨",
			}),
		).toThrow();
	});

	test("rejects every invalid fixture with a stable Korean code", async () => {
		const invalid = await fixture("invalid-domain");
		const cases: ReadonlyArray<{
			readonly name: string;
			readonly code: DomainErrorCode;
			readonly parse: (input: unknown) => unknown;
		}> = [
			{
				name: "unknownKey",
				code: "KCH-E-SCHEMA-001",
				parse: (input) => parseDomainBoundary(SlideSchema, input, "KCH-E-SCHEMA-001"),
			},
			{
				name: "missingClaim",
				code: "KCH-E-SCHEMA-002",
				parse: (input) => parseDomainBoundary(SlideSchema, input, "KCH-E-SCHEMA-002"),
			},
			{
				name: "layoutCoordinates",
				code: "KCH-E-SCHEMA-003",
				parse: (input) => parseDomainBoundary(SlideSchema, input, "KCH-E-SCHEMA-003"),
			},
			{
				name: "malformedChart",
				code: "KCH-E-SCHEMA-004",
				parse: (input) => parseDomainBoundary(VisualSchema, input, "KCH-E-SCHEMA-004"),
			},
			{
				name: "malformedTable",
				code: "KCH-E-SCHEMA-005",
				parse: (input) => parseDomainBoundary(VisualSchema, input, "KCH-E-SCHEMA-005"),
			},
			{
				name: "incompleteProvenance",
				code: "KCH-E-SCHEMA-006",
				parse: (input) => parseDomainBoundary(AssetProvenanceSchema, input, "KCH-E-SCHEMA-006"),
			},
		];
		for (const testCase of cases) {
			try {
				testCase.parse(invalid[testCase.name]);
				throw new Error(`expected domain boundary failure: ${testCase.name}`);
			} catch (error) {
				expect(error).toBeInstanceOf(DomainBoundaryError);
				expect((error as DomainBoundaryError).code).toBe(testCase.code);
				expect((error as Error).message).toMatch(/[가-힣]/u);
			}
		}
	});
});
