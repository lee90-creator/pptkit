import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { resolveOfficeQaScriptPath, runOfficeQa } from "../../src/office-qa/adapter.js";
import type { ProcessRequest, ProcessResult, ProcessRunner } from "../../src/providers/contract.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(): Promise<{ readonly root: string; readonly source: string; readonly hash: string }> {
	const root = await mkdtemp(join(tmpdir(), "kch-office-qa-"));
	roots.push(root);
	const source = join(root, "source.pptx");
	await writeFile(source, "promoted-pptx");
	const hash = createHash("sha256")
		.update(await readFile(source))
		.digest("hex");
	return { root, source, hash };
}

class Runner implements ProcessRunner {
	constructor(private readonly execute: (request: ProcessRequest) => Promise<ProcessResult>) {}

	run(request: ProcessRequest): Promise<ProcessResult> {
		return this.execute(request);
	}
}

function resultPath(request: ProcessRequest): string {
	const index = request.args.indexOf("-ResultPath");
	const value = request.args[index + 1];
	if (index < 0 || value === undefined) {
		throw new Error("missing result path");
	}
	return value;
}

describe("optional PowerPoint QA adapter", () => {
	test("resolves the bundled app-local PowerPoint script without import.meta.url", () => {
		expect(resolveOfficeQaScriptPath("/install/app/kch-ppt.cjs", "/workspace")).toBe(
			"/install/office-qa/powerpoint.ps1",
		);
		expect(resolveOfficeQaScriptPath("/workspace/src/index.ts", "/workspace")).toBe(
			"/workspace/src/office-qa/powerpoint.ps1",
		);
	});

	test("parses verified request/result-file output", async () => {
		const { root, source, hash } = await fixture();
		const runner = new Runner(async (request) => {
			await writeFile(
				resultPath(request),
				`\uFEFF${JSON.stringify({
					status: "verified",
					originalSha256: hash,
					slideCount: 17,
					pngCount: 17,
					pdfPageCount: 17,
					roundtripPngCount: 17,
					roundtripPath: join(root, "roundtrip.pptx"),
					edits: { text: true, table: true, chart: true },
					cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
				})}`,
			);
			return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
		});
		const result = await runOfficeQa(
			{ pptxPath: source, evidenceDirectory: join(root, "evidence") },
			{ runner, powershellCommand: "powershell.exe", scriptPath: "powerpoint.ps1" },
		);
		expect(result.status).toBe("verified");
		expect(result.originalSha256).toBe(hash);
	});

	test("passes absolute source and evidence paths to PowerPoint", async () => {
		const { root, source, hash } = await fixture();
		let received: Record<string, string> | undefined;
		const runner = new Runner(async (request) => {
			const requestPath = request.args[request.args.indexOf("-RequestPath") + 1];
			if (requestPath === undefined) {
				throw new Error("missing request path");
			}
			received = JSON.parse(await readFile(requestPath, "utf8")) as Record<string, string>;
			await writeFile(
				resultPath(request),
				JSON.stringify({
					status: "verified",
					originalSha256: hash,
					slideCount: 17,
					pngCount: 17,
					pdfPageCount: 17,
					roundtripPngCount: 17,
					roundtripPath: resolve(root, "roundtrip.pptx"),
					edits: { text: true, table: true, chart: true },
					cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
				}),
			);
			return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
		});
		const result = await runOfficeQa(
			{
				pptxPath: relative(process.cwd(), source),
				evidenceDirectory: relative(process.cwd(), join(root, "evidence")),
			},
			{ runner, powershellCommand: "powershell.exe", scriptPath: "powerpoint.ps1" },
		);
		expect(result.status).toBe("verified");
		expect(received?.sourcePptx).toBe(source);
		expect(
			Object.values(received ?? {})
				.filter((value) => value.includes(root))
				.every(isAbsolute),
		).toBe(true);
	});

	test.each([
		["absent", { exitCode: 127, stdout: "", stderr: "not found", timedOut: false }, "invocation-failed"],
		["forced kill", { exitCode: -1, stdout: "", stderr: "", timedOut: true }, "process-timeout"],
	] as const)("returns render-unverified for %s without changing source", async (_name, processResult, reason) => {
		const { root, source, hash } = await fixture();
		const result = await runOfficeQa(
			{ pptxPath: source, evidenceDirectory: join(root, "evidence") },
			{ runner: new Runner(async () => processResult), powershellCommand: "missing", scriptPath: "powerpoint.ps1" },
		);
		expect(result).toMatchObject({ status: "render-unverified", reason, originalSha256: hash });
		expect(
			createHash("sha256")
				.update(await readFile(source))
				.digest("hex"),
		).toBe(hash);
	});

	test("rejects malformed result JSON without changing source", async () => {
		const { root, source, hash } = await fixture();
		const runner = new Runner(async (request) => {
			await writeFile(resultPath(request), '{"status":"verified"}');
			return { exitCode: 0, stdout: "", stderr: "", timedOut: false };
		});
		const result = await runOfficeQa(
			{ pptxPath: source, evidenceDirectory: join(root, "evidence") },
			{ runner, powershellCommand: "powershell.exe", scriptPath: "powerpoint.ps1" },
		);
		expect(result).toMatchObject({ status: "render-unverified", reason: "malformed-result" });
		expect(
			createHash("sha256")
				.update(await readFile(source))
				.digest("hex"),
		).toBe(hash);
	});

	test("restores source bytes if a failed runner mutates the promoted PPTX", async () => {
		const { root, source, hash } = await fixture();
		const runner = new Runner(async () => {
			await writeFile(source, "corrupted");
			return { exitCode: -1, stdout: "", stderr: "", timedOut: true };
		});
		const result = await runOfficeQa(
			{ pptxPath: source, evidenceDirectory: join(root, "evidence") },
			{ runner, powershellCommand: "powershell.exe", scriptPath: "powerpoint.ps1" },
		);
		expect(result).toMatchObject({ status: "render-unverified", reason: "source-mutated-restored" });
		expect(
			createHash("sha256")
				.update(await readFile(source))
				.digest("hex"),
		).toBe(hash);
	});
});
