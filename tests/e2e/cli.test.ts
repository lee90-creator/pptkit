import { describe, expect, test } from "bun:test";

import { parseCliArgs } from "../../src/cli/args.js";
import { formatCliError } from "../../src/cli/korean-errors.js";
import { runCli } from "../../src/cli/main.js";

describe("KCH CLI contract", () => {
	test("parses exact demo and diagnose modes", () => {
		expect(parseCliArgs(["--demo", "--provider", "auto", "--output", "demo.pptx"])).toEqual({
			mode: "demo",
			provider: "auto",
			outputPath: "demo.pptx",
			acceptClaudeSubscriptionUse: false,
			officeQa: true,
		});
		expect(parseCliArgs(["--diagnose"])).toEqual({ mode: "diagnose" });
		expect(parseCliArgs(["generate", "--spec", "request.json", "--output", "result.pptx", "--no-office-qa"])).toEqual({
			mode: "generate",
			specPath: "request.json",
			outputPath: "result.pptx",
			officeQa: false,
		});
	});

	test.each([
		[["--demo", "--provider", "other", "--output", "demo.pptx"], "KCH-E-CLI-001"],
		[["--demo"], "KCH-E-CLI-001"],
		[["--demo", "--diagnose", "--output", "demo.pptx"], "KCH-E-CLI-001"],
	] as const)("rejects bad arguments with a stable Korean CLI code", (args, code) => {
		try {
			parseCliArgs(args);
			throw new Error("expected argument failure");
		} catch (error) {
			expect(formatCliError(error)).toMatchObject({ code, exitCode: 2 });
			expect(formatCliError(error).message).toMatch(/[가-힣]/u);
		}
	});

	test("does not expose raw Node error codes or English filesystem messages", () => {
		const error = Object.assign(new Error("ENOENT: no such file or directory"), { code: "ENOENT" });
		expect(formatCliError(error)).toEqual({
			code: "KCH-E-WORKFLOW-001",
			message: "작업을 완료하지 못했습니다. 입력 파일과 실행 환경을 확인하세요.",
			exitCode: 1,
		});
	});

	test("dispatches demo and prints the selected provider receipt", async () => {
		const lines: string[] = [];
		let observed: unknown;
		const exitCode = await runCli(["--demo", "--provider", "codex", "--output", "demo.pptx", "--no-office-qa"], {
			runDemo: async (request) => {
				observed = request;
				return {
					provider: "codex",
					integrity: {
						bytes: 10,
						sha256: "a".repeat(64),
						requiredParts: ["[Content_Types].xml", "ppt/presentation.xml"],
					},
					officeQa: {
						status: "render-unverified",
						reason: "render-failed",
						originalSha256: "a".repeat(64),
						cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
					},
					imageStatus: "resolved",
					provenancePath: "demo.pptx.provenance.json",
				};
			},
			writeOut: (line) => lines.push(line),
		});
		expect(exitCode).toBe(0);
		expect(observed).toMatchObject({ provider: "codex", outputPath: "demo.pptx", officeQa: false });
		expect(lines.join("")).toContain('"provider":"codex"');
	});

	test("dispatches a conversation spec without invoking another AI provider", async () => {
		const lines: string[] = [];
		let observed: unknown;
		const exitCode = await runCli(["generate", "--spec", "request.json", "--output", "result.pptx", "--no-office-qa"], {
			runSpec: async (request) => {
				observed = request;
				return {
					integrity: {
						bytes: 10,
						sha256: "b".repeat(64),
						requiredParts: ["[Content_Types].xml", "ppt/presentation.xml"],
					},
					officeQa: {
						status: "render-unverified",
						reason: "render-failed",
						originalSha256: "b".repeat(64),
						cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
					},
					slideCount: 8,
					provenancePath: "result.pptx.provenance.json",
				};
			},
			writeOut: (line) => lines.push(line),
		});
		expect(exitCode).toBe(0);
		expect(observed).toEqual({
			specPath: "request.json",
			outputPath: "result.pptx",
			officeQa: false,
		});
		expect(lines.join("")).toContain('"source":"conversation"');
		expect(lines.join("")).toContain('"slides":8');
	});
});
