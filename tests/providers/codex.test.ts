import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import { CodexAdapterError, executeCodex } from "../../src/providers/codex.js";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/providers/contract.js";
import { requireAllJsonSchemaProperties } from "../../src/providers/json-schema.js";

const ResultSchema = z.object({
	provider: z.literal("codex"),
	status: z.literal("ok"),
});

class RecordingRunner implements ProcessRunner {
	readonly requests: ProcessRequest[] = [];

	constructor(private readonly result: ProcessResult) {}

	async run(request: ProcessRequest): Promise<ProcessResult> {
		this.requests.push(request);
		return this.result;
	}
}

async function fixture(name: string): Promise<string> {
	return readFile(new URL(`../fixtures/providers/codex/${name}.jsonl`, import.meta.url), "utf8");
}

function processResult(stdout: string, overrides: Partial<ProcessResult> = {}): ProcessResult {
	return {
		exitCode: 0,
		stdout,
		stderr: "",
		timedOut: false,
		...overrides,
	};
}

async function invoke(runner: ProcessRunner) {
	return executeCodex({
		executable: "codex",
		prompt: "Return the contract result",
		outputSchema: ResultSchema,
		jsonSchemaPath: "schema.json",
		workingDirectory: "work",
		timeoutMs: 1_000,
		runner,
	});
}

describe("Codex JSONL adapter", () => {
	test("normalizes every nested object property for strict structured outputs", () => {
		const schema = requireAllJsonSchemaProperties({
			type: "object",
			properties: {
				slides: {
					type: "array",
					items: {
						type: "object",
						properties: { title: { type: "string" }, optionalNote: { type: "string" } },
						required: ["title"],
					},
				},
			},
			required: ["slides"],
		}) as {
			readonly properties: {
				readonly slides: { readonly items: { readonly required: readonly string[] } };
			};
		};
		expect(schema.properties.slides.items.required).toEqual(["title", "optionalNote"]);
	});

	test("accepts a completed terminal turn and host-validates its final message", async () => {
		const runner = new RecordingRunner(processResult(await fixture("success")));
		await expect(invoke(runner)).resolves.toEqual({
			provider: "codex",
			value: { provider: "codex", status: "ok" },
		});
		expect(runner.requests).toEqual([
			{
				command: "codex",
				args: [
					"exec",
					"--json",
					"--ephemeral",
					"--skip-git-repo-check",
					"--sandbox",
					"read-only",
					"--output-schema",
					"schema.json",
					"-",
				],
				cwd: "work",
				stdin: "Return the contract result",
				timeoutMs: 1_000,
			},
		]);
	});

	test("does not fail on a nonfatal intermediate error event", async () => {
		const runner = new RecordingRunner(processResult(await fixture("nonfatal-error")));
		await expect(invoke(runner)).resolves.toMatchObject({
			value: { provider: "codex", status: "ok" },
		});
	});

	test("rejects a failed terminal turn with an actionable Korean error", async () => {
		const runner = new RecordingRunner(processResult(await fixture("turn-failed")));
		await expectKoreanCodexError(invoke(runner));
	});

	test("rejects malformed final output at the host boundary", async () => {
		const runner = new RecordingRunner(processResult(await fixture("malformed-final")));
		await expect(invoke(runner)).rejects.toMatchObject({ code: "KCH-E-CODEX-003" });
	});

	test("rejects an incomplete timed-out turn", async () => {
		const runner = new RecordingRunner(processResult(await fixture("timeout"), { exitCode: -1, timedOut: true }));
		await expect(invoke(runner)).rejects.toMatchObject({ code: "KCH-E-CODEX-001" });
	});

	test("rejects an incomplete turn even when the process exits zero", async () => {
		const runner = new RecordingRunner(processResult(await fixture("timeout")));
		await expect(invoke(runner)).rejects.toMatchObject({ code: "KCH-E-CODEX-002" });
	});

	test("rejects a nonzero process exit before parsing output", async () => {
		const runner = new RecordingRunner(
			processResult(await fixture("nonzero-exit"), {
				exitCode: 7,
				stderr: "provider process failed",
			}),
		);
		await expectKoreanCodexError(invoke(runner));
	});
});

async function expectKoreanCodexError(promise: Promise<unknown>): Promise<void> {
	try {
		await promise;
		throw new Error("expected Codex adapter to fail");
	} catch (error) {
		expect(error).toBeInstanceOf(CodexAdapterError);
		expect((error as CodexAdapterError).code).toStartWith("KCH-E-CODEX-");
		expect((error as Error).message).toMatch(/[가-힣]/u);
	}
}
