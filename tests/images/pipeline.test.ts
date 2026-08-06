import { describe, expect, test } from "bun:test";

import { buildImagePrompt } from "../../src/images/prompt.js";
import {
	type ImageFetch,
	executeCodexImageExtension,
	requestOpenAiImage,
	resolveImageAsset,
} from "../../src/images/provider.js";
import type { ProcessRequest } from "../../src/providers/contract.js";
import { AssetProvenanceSchema } from "../../src/schema/asset.js";

const REQUEST = {
	assetId: "asset-wind-hero",
	slideId: "slide-wind-01",
	alt: "신안 해상풍력 단지 전경",
	purpose: "해상풍력 사업 소개용 사실적 전경",
	aspectRatio: 16 / 9,
} as const;

describe("provider-guided image asset pipeline", () => {
	test("uses a supplied asset before every provider", async () => {
		const calls: string[] = [];
		const result = await resolveImageAsset(
			{
				...REQUEST,
				supplied: {
					path: "logo/KCH_LOGOV2.png",
					pixelWidth: 458,
					pixelHeight: 246,
					identifier: "logo/KCH_LOGOV2.png",
					licenseStatus: "internal-use-only",
				},
			},
			{
				fileExists: async () => true,
				codexExtension: async () => {
					calls.push("codex");
					throw new Error("must not run");
				},
			},
		);
		expect(result.status).toBe("resolved");
		expect(result.status === "resolved" && result.asset.provenance.source).toBe("provided");
		expect(calls).toEqual([]);
	});

	test("uses Codex image extension before OpenAI or stock", async () => {
		const calls: string[] = [];
		const result = await resolveImageAsset(REQUEST, {
			fileExists: async () => false,
			codexExtension: async () => {
				calls.push("codex");
				return { path: "generated/wind.png", pixelWidth: 1600, pixelHeight: 900, identifier: "codex-run-1" };
			},
			openAi: {
				apiKey: "explicit-key",
				generate: async () => {
					calls.push("openai");
					throw new Error("must not run");
				},
			},
		});
		expect(result.status).toBe("resolved");
		expect(result.status === "resolved" && result.asset.provenance.source).toBe("codex-extension");
		expect(calls).toEqual(["codex"]);
	});

	test("never invokes OpenAI without an explicit API key and accepts licensed stock", async () => {
		const calls: string[] = [];
		const result = await resolveImageAsset(REQUEST, {
			fileExists: async () => false,
			openAi: {
				apiKey: undefined,
				generate: async () => {
					calls.push("openai");
					throw new Error("must not run");
				},
			},
			stock: async () => ({
				path: "stock/wind.jpg",
				pixelWidth: 1800,
				pixelHeight: 1200,
				identifier: "https://stock.example/wind",
				licenseStatus: "CC-BY-4.0",
			}),
		});
		expect(result.status).toBe("resolved");
		expect(result.status === "resolved" && result.asset.provenance.source).toBe("stock");
		expect(calls).toEqual([]);
	});

	test("falls back to native shapes when stock lacks license metadata", async () => {
		const result = await resolveImageAsset(REQUEST, {
			fileExists: async () => false,
			stock: async () => ({
				path: "stock/unlicensed.jpg",
				pixelWidth: 1000,
				pixelHeight: 500,
				identifier: "https://stock.example/unlicensed",
				licenseStatus: "",
			}),
		});
		expect(result.status).toBe("native-fallback");
		expect(result.status === "native-fallback" && result.fallback.nativeObject).toBe("shape");
		expect(result.attempts.map((attempt) => attempt.stage)).toContain("stock");
	});

	test("records stable prompt and exhaustive provenance", async () => {
		const prompt = buildImagePrompt(REQUEST);
		const again = buildImagePrompt(REQUEST);
		expect(prompt).toEqual(again);
		expect(prompt.sha256).toMatch(/^[a-f0-9]{64}$/);
		const result = await resolveImageAsset(REQUEST, {
			fileExists: async () => false,
			codexExtension: async () => ({
				data: "image/png;base64,AA==",
				pixelWidth: 1600,
				pixelHeight: 900,
				identifier: "codex-run-2",
			}),
			now: () => "2026-08-03T00:00:00.000Z",
		});
		expect(result.status).toBe("resolved");
		if (result.status !== "resolved") {
			throw new Error("expected resolved asset");
		}
		expect(AssetProvenanceSchema.parse(result.asset.provenance)).toEqual(result.asset.provenance);
		expect(result.asset.provenance.promptHash).toBe(prompt.sha256);
	});

	test("degrades provider failures deterministically without rasterizing data visuals", async () => {
		const result = await resolveImageAsset(REQUEST, {
			fileExists: async () => false,
			codexExtension: async () => {
				throw new Error("extension failed");
			},
			openAi: {
				apiKey: "explicit-key",
				generate: async () => {
					throw new Error("api failed");
				},
			},
			stock: async () => undefined,
		});
		expect(result.status).toBe("native-fallback");
		expect(result.attempts.map((attempt) => `${attempt.stage}:${attempt.status}`)).toEqual([
			"supplied:skipped",
			"codex-extension:failed",
			"openai-api:failed",
			"stock:failed",
			"native-fallback:resolved",
		]);
		expect(result.status === "native-fallback" && result.fallback.reason).toBe("image-providers-unavailable");
	});

	test("executes a detected Codex image extension through stdin and strict JSON", async () => {
		let observed: ProcessRequest | undefined;
		const image = await executeCodexImageExtension({
			executable: "codex-image-extension",
			args: ["--json"],
			prompt: "wind prompt",
			timeoutMs: 30_000,
			runner: {
				run: async (request) => {
					observed = request;
					return {
						exitCode: 0,
						stdout: JSON.stringify({
							path: "generated/wind.png",
							pixelWidth: 1600,
							pixelHeight: 900,
							identifier: "codex-extension:1",
						}),
						stderr: "",
						timedOut: false,
					};
				},
			},
		});
		expect(observed).toMatchObject({
			command: "codex-image-extension",
			args: ["--json"],
			stdin: "wind prompt",
		});
		expect(image.identifier).toBe("codex-extension:1");
	});

	test("calls OpenAI Images only with an explicit key and parses base64", async () => {
		let requests = 0;
		const fetcher: ImageFetch = async (_input, init) => {
			requests += 1;
			expect(init?.headers).toEqual({
				Authorization: "Bearer explicit-key",
				"Content-Type": "application/json",
			});
			return new Response(JSON.stringify({ data: [{ b64_json: "AA==" }] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		};
		await expect(requestOpenAiImage("prompt", "", fetcher)).rejects.toThrow("key is required");
		expect(requests).toBe(0);
		const image = await requestOpenAiImage("prompt", "explicit-key", fetcher);
		expect(requests).toBe(1);
		expect(image.data).toBe("image/png;base64,AA==");
	});
});
