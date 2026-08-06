import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import {
	resolveWorkflowAssetRoot,
	resolveWorkflowOfficeQaScriptPath,
	runDemoWorkflow,
} from "../../src/cli/workflow.js";
import type { ProviderDetection, ProviderName } from "../../src/providers/contract.js";

const roots: string[] = [];

test("workflow resolves Office QA from the bundled entrypoint when install root is absent", () => {
	expect(resolveWorkflowOfficeQaScriptPath(undefined, "/install/app/kch-ppt.cjs", "/workspace")).toBe(
		"/install/office-qa/powerpoint.ps1",
	);
	expect(resolveWorkflowOfficeQaScriptPath("/custom/install", "/ignored/app.cjs", "/workspace")).toBe(
		"/custom/install/office-qa/powerpoint.ps1",
	);
});

test("workflow resolves assets from the bundled install root instead of the caller directory", () => {
	expect(resolveWorkflowAssetRoot(undefined, "/install/app/kch-ppt.cjs", "/caller")).toBe("/install/assets");
	expect(resolveWorkflowAssetRoot(undefined, "/workspace/dist/app/kch-ppt.cjs", "/caller")).toBe("/workspace/assets");
	expect(resolveWorkflowAssetRoot(undefined, "/workspace/src/index.ts", "/workspace")).toBe("/workspace/assets");
});

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "kch-workflow-"));
	roots.push(directory);
	return directory;
}

async function narrative(): Promise<unknown> {
	const value = JSON.parse(await readFile(resolve("tests/fixtures/planner/korean-demo.json"), "utf8")) as {
		slides: Array<Record<string, unknown>>;
	};
	const templates = value.slides;
	value.slides = Array.from({ length: 17 }, (_, index) => ({
		...structuredClone(templates[index % templates.length]),
		id: `demo-${index + 1}`,
	}));
	return value;
}

function authenticated(provider: ProviderName): ProviderDetection {
	return { provider, state: "authenticated", executable: `${provider}.cmd` };
}

describe("end-to-end demo workflow", () => {
	test("routes Codex, validates narrative, promotes a native deck, and records provenance", async () => {
		const directory = await root();
		const output = join(directory, "demo.pptx");
		const result = await runDemoWorkflow(
			{ provider: "auto", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
			{
				detect: async (provider) => authenticated(provider),
				invokeProvider: async () => narrative(),
				assetRoot: resolve("assets"),
				now: () => new Date("2026-08-03T00:00:00.000Z"),
			},
		);
		expect(result.provider).toBe("codex");
		expect(result.integrity.bytes).toBeGreaterThan(0);
		expect(result.officeQa.status).toBe("render-unverified");
		const receipt = JSON.parse(await readFile(`${output}.provenance.json`, "utf8")) as {
			readonly provider: string;
			readonly slideSpecCount: number;
			readonly imageStatus: string;
		};
		expect(receipt).toMatchObject({ provider: "codex", slideSpecCount: 17, imageStatus: "resolved" });
	}, 30_000);

	test("falls back to authenticated Claude when auto-selected Codex execution fails", async () => {
		const directory = await root();
		const output = join(directory, "auto-fallback.pptx");
		const invocations: ProviderName[] = [];
		const result = await runDemoWorkflow(
			{ provider: "auto", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
			{
				detect: async (provider) => authenticated(provider),
				invokeProvider: async (detection) => {
					invocations.push(detection.provider);
					if (detection.provider === "codex") {
						throw new Error("Codex timed out");
					}
					return narrative();
				},
				assetRoot: resolve("assets"),
			},
		);
		expect(invocations).toEqual(["codex", "claude"]);
		expect(result.provider).toBe("claude");
		expect(result.integrity.bytes).toBeGreaterThan(0);
	}, 30_000);

	test("rejects malformed provider output before creating a target", async () => {
		const directory = await root();
		const output = join(directory, "malformed.pptx");
		await expect(
			runDemoWorkflow(
				{ provider: "codex", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
				{
					detect: async () => authenticated("codex"),
					invokeProvider: async () => ({ invalid: true }),
					assetRoot: resolve("assets"),
				},
			),
		).rejects.toThrow();
		await expect(readFile(output)).rejects.toBeDefined();
	});

	test("reports neither provider before creating a target", async () => {
		const directory = await root();
		const output = join(directory, "neither.pptx");
		await expect(
			runDemoWorkflow(
				{ provider: "auto", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
				{
					detect: async (provider) => ({ provider, state: "missing" }),
					invokeProvider: async () => narrative(),
					assetRoot: resolve("assets"),
				},
			),
		).rejects.toMatchObject({ code: "KCH-E-PROVIDER-001" });
		await expect(readFile(output)).rejects.toBeDefined();
	});

	test("preserves an existing output collision without invoking a provider", async () => {
		const directory = await root();
		const output = join(directory, "existing.pptx");
		await writeFile(output, "existing");
		const before = createHash("sha256")
			.update(await readFile(output))
			.digest("hex");
		let invocations = 0;
		await expect(
			runDemoWorkflow(
				{ provider: "codex", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
				{
					detect: async () => authenticated("codex"),
					invokeProvider: async () => {
						invocations += 1;
						return narrative();
					},
					assetRoot: resolve("assets"),
				},
			),
		).rejects.toMatchObject({ code: "KCH-E-OUTPUT-002" });
		expect(invocations).toBe(0);
		expect(
			createHash("sha256")
				.update(await readFile(output))
				.digest("hex"),
		).toBe(before);
	});

	test("preserves a stale provenance collision before invoking a provider", async () => {
		const directory = await root();
		const output = join(directory, "stale.pptx");
		await writeFile(`${output}.provenance.json`, "existing-provenance");
		let invocations = 0;
		await expect(
			runDemoWorkflow(
				{ provider: "codex", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
				{
					detect: async () => authenticated("codex"),
					invokeProvider: async () => {
						invocations += 1;
						return narrative();
					},
					assetRoot: resolve("assets"),
				},
			),
		).rejects.toMatchObject({ code: "KCH-E-OUTPUT-002" });
		expect(invocations).toBe(0);
		expect(await readFile(`${output}.provenance.json`, "utf8")).toBe("existing-provenance");
	});

	test("completes with native image fallback provenance when image resolution fails", async () => {
		const directory = await root();
		const output = join(directory, "fallback.pptx");
		const result = await runDemoWorkflow(
			{ provider: "codex", outputPath: output, officeQa: false, acceptClaudeSubscriptionUse: false },
			{
				detect: async () => authenticated("codex"),
				invokeProvider: async () => narrative(),
				assetRoot: resolve("assets"),
				imageFileExists: async () => false,
			},
		);
		expect(result.imageStatus).toBe("native-fallback");
		expect(result.integrity.bytes).toBeGreaterThan(0);
	}, 30_000);
});
