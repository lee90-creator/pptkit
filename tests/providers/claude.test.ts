import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

import { ClaudeConsentError, ClaudeConsentReceiptSchema, claudeConsentPath } from "../../src/consent/claude.js";
import { ClaudeAdapterError, executeClaude, executeClaudeIfSelected } from "../../src/providers/claude.js";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/providers/contract.js";

const ResultSchema = z.object({
	provider: z.literal("claude"),
	status: z.literal("ok"),
});
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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
	return readFile(new URL(`../fixtures/providers/claude/${name}`, import.meta.url), "utf8");
}

async function localAppData(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "kch-claude-"));
	roots.push(root);
	return root;
}

function processResult(stdout: string, overrides: Partial<ProcessResult> = {}): ProcessResult {
	return { exitCode: 0, stdout, stderr: "", timedOut: false, ...overrides };
}

async function request(
	runner: ProcessRunner,
	options: {
		readonly localAppData: string;
		readonly accept?: boolean;
		readonly now?: () => Date;
	},
) {
	return {
		executable: "claude",
		prompt: "Return the contract result",
		outputSchema: ResultSchema,
		jsonSchema: JSON.stringify({ type: "object" }),
		rerunCommand: 'dist\\run.bat --provider claude --output "evidence\\demo.pptx"',
		timeoutMs: 1_000,
		runner,
		...options,
	};
}

describe("Claude subscription consent", () => {
	test("blocks before spawn and returns the exact flag-bearing rerun command", async () => {
		const root = await localAppData();
		const runner = new RecordingRunner(processResult(await fixture("success.json")));
		try {
			await executeClaude(await request(runner, { localAppData: root }));
			throw new Error("expected consent failure");
		} catch (error) {
			expect(error).toBeInstanceOf(ClaudeConsentError);
			expect((error as ClaudeConsentError).code).toBe("KCH-E-CONSENT-001");
			expect((error as Error).message).toContain(
				'dist\\run.bat --provider claude --output "evidence\\demo.pptx" --accept-claude-subscription-use',
			);
		}
		expect(runner.requests).toHaveLength(0);
	});

	test("accept flag atomically writes a valid receipt and later runs reuse it", async () => {
		const root = await localAppData();
		const runner = new RecordingRunner(processResult(await fixture("success.json")));
		const first = await executeClaude(
			await request(runner, {
				localAppData: root,
				accept: true,
				now: () => new Date("2026-08-03T00:00:00.000Z"),
			}),
		);
		expect(first.value).toEqual({ provider: "claude", status: "ok" });

		const receiptPath = claudeConsentPath(root);
		const receipt = ClaudeConsentReceiptSchema.parse(JSON.parse(await readFile(receiptPath, "utf8")));
		expect(receipt).toEqual({
			policy: "claude-subscription-reuse",
			version: 1,
			acceptedAt: "2026-08-03T00:00:00.000Z",
		});
		expect(await readdir(path.dirname(receiptPath))).toEqual(["claude-subscription-v1.json"]);

		await expect(executeClaude(await request(runner, { localAppData: root }))).resolves.toMatchObject({
			provider: "claude",
		});
		expect(runner.requests).toHaveLength(2);
	});

	test.each([
		[{ policy: "claude-subscription-reuse", version: 2, acceptedAt: "2026-08-03T00:00:00.000Z" }],
		[{ policy: "claude-subscription-reuse", version: 1, acceptedAt: "not-a-date" }],
	] as const)("invalid receipt reblocks before spawn", async (receipt) => {
		const root = await localAppData();
		const receiptPath = claudeConsentPath(root);
		await Bun.write(receiptPath, JSON.stringify(receipt));
		const runner = new RecordingRunner(processResult(await fixture("success.json")));
		await expect(executeClaude(await request(runner, { localAppData: root }))).rejects.toMatchObject({
			code: "KCH-E-CONSENT-001",
		});
		expect(runner.requests).toHaveLength(0);
	});

	test("auto selecting Codex neither reads nor writes Claude consent", async () => {
		const root = await localAppData();
		const runner = new RecordingRunner(processResult(await fixture("success.json")));
		await expect(
			executeClaudeIfSelected("codex", await request(runner, { localAppData: root, accept: true })),
		).resolves.toEqual({ provider: "codex", skippedClaude: true });
		expect(runner.requests).toHaveLength(0);
		await expect(readFile(claudeConsentPath(root))).rejects.toBeDefined();
	});
});

describe("Claude structured output adapter", () => {
	test.each(["success.json", "success.ndjson"] as const)("parses and validates %s", async (name) => {
		const root = await localAppData();
		const runner = new RecordingRunner(processResult(await fixture(name)));
		await expect(executeClaude(await request(runner, { localAppData: root, accept: true }))).resolves.toEqual({
			provider: "claude",
			value: { provider: "claude", status: "ok" },
		});
		expect(runner.requests).toHaveLength(1);
		expect(runner.requests[0]).toMatchObject({
			command: "claude",
			args: ["-p", "--output-format", "json", "--json-schema", '{"type":"object"}'],
			stdin: "Return the contract result",
		});
	});

	test("rejects malformed structured output in Korean", async () => {
		const root = await localAppData();
		const runner = new RecordingRunner(processResult(await fixture("malformed.json")));
		await expectKoreanClaudeError(executeClaude(await request(runner, { localAppData: root, accept: true })));
	});

	test("rejects nonzero and timeout results in Korean", async () => {
		const root = await localAppData();
		const nonzero = new RecordingRunner(
			processResult(await fixture("nonzero.json"), { exitCode: 5, stderr: "failed" }),
		);
		await expectKoreanClaudeError(executeClaude(await request(nonzero, { localAppData: root, accept: true })));

		const timeout = new RecordingRunner(
			processResult(await fixture("timeout.ndjson"), { exitCode: -1, timedOut: true }),
		);
		await expectKoreanClaudeError(executeClaude(await request(timeout, { localAppData: root })));
	});

	test("fixtures contain no token-shaped values", async () => {
		for (const name of ["success.json", "success.ndjson", "malformed.json", "nonzero.json", "timeout.ndjson"]) {
			const content = await fixture(name);
			expect(content).not.toMatch(/(?:sk-|oauth|bearer\s+)[A-Za-z0-9_-]{8,}/iu);
		}
	});
});

async function expectKoreanClaudeError(promise: Promise<unknown>): Promise<void> {
	try {
		await promise;
		throw new Error("expected Claude adapter failure");
	} catch (error) {
		expect(error).toBeInstanceOf(ClaudeAdapterError);
		expect((error as Error).message).toMatch(/[가-힣]/u);
	}
}
