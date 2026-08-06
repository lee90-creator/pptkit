import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type { ProcessResult, ProcessRunner } from "../providers/contract.js";
import { NodeProcessRunner } from "../providers/process.js";
import { type OfficeQaReason, type OfficeQaResult, OfficeQaResultSchema } from "./result.js";

export interface OfficeQaRequest {
	readonly pptxPath: string;
	readonly evidenceDirectory: string;
	readonly timeoutMs?: number;
}

export interface OfficeQaDependencies {
	readonly runner?: ProcessRunner;
	readonly powershellCommand?: string;
	readonly scriptPath?: string;
}

export function resolveOfficeQaScriptPath(entrypoint = process.argv[1], cwd = process.cwd()): string {
	if (entrypoint !== undefined && basename(entrypoint).toLowerCase() === "kch-ppt.cjs") {
		return resolve(dirname(entrypoint), "..", "office-qa", "powerpoint.ps1");
	}
	return resolve(cwd, "src", "office-qa", "powerpoint.ps1");
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function unverified(reason: OfficeQaReason, originalSha256: string, detail?: string): OfficeQaResult {
	return {
		status: "render-unverified",
		reason,
		originalSha256,
		...(detail ? { detail } : {}),
		cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
	};
}

async function readResult(resultPath: string): Promise<OfficeQaResult | undefined> {
	try {
		const text = await readFile(resultPath, "utf8");
		return OfficeQaResultSchema.parse(JSON.parse(text.replace(/^\uFEFF/u, "")));
	} catch {
		return undefined;
	}
}

async function sourceWasRestored(pptxPath: string, originalBytes: Uint8Array, originalHash: string): Promise<boolean> {
	let currentHash: string;
	try {
		currentHash = sha256(await readFile(pptxPath));
	} catch {
		currentHash = "";
	}
	if (currentHash === originalHash) {
		return false;
	}
	await writeFile(pptxPath, originalBytes);
	if (sha256(await readFile(pptxPath)) !== originalHash) {
		throw new Error("KCH-E-OUTPUT-001: PowerPoint QA 이후 원본 PPTX를 복원하지 못했습니다.");
	}
	return true;
}

export async function runOfficeQa(
	request: OfficeQaRequest,
	dependencies: OfficeQaDependencies = {},
): Promise<OfficeQaResult> {
	const pptxPath = resolve(request.pptxPath);
	const evidenceDirectory = resolve(request.evidenceDirectory);
	const originalBytes = await readFile(pptxPath);
	const originalHash = sha256(originalBytes);
	await mkdir(evidenceDirectory, { recursive: true });
	const requestPath = join(evidenceDirectory, "request.json");
	const resultPath = join(evidenceDirectory, "result.json");
	await rm(resultPath, { force: true });
	await writeFile(
		requestPath,
		`${JSON.stringify(
			{
				sourcePptx: pptxPath,
				originalSha256: originalHash,
				renderDirectory: join(evidenceDirectory, "render"),
				pdfPath: join(evidenceDirectory, "render.pdf"),
				roundtripPath: join(evidenceDirectory, "roundtrip.pptx"),
				roundtripRenderDirectory: join(evidenceDirectory, "roundtrip-render"),
			},
			null,
			2,
		)}\n`,
		"utf8",
	);
	const scriptPath = dependencies.scriptPath ?? resolveOfficeQaScriptPath();
	let processResult: ProcessResult;
	try {
		processResult = await (dependencies.runner ?? new NodeProcessRunner()).run({
			command: dependencies.powershellCommand ?? "powershell.exe",
			args: [
				"-NoLogo",
				"-NoProfile",
				"-NonInteractive",
				"-ExecutionPolicy",
				"Bypass",
				"-File",
				scriptPath,
				"-RequestPath",
				requestPath,
				"-ResultPath",
				resultPath,
			],
			timeoutMs: request.timeoutMs ?? 180_000,
		});
	} catch (error) {
		const restored = await sourceWasRestored(pptxPath, originalBytes, originalHash);
		return unverified(
			restored ? "source-mutated-restored" : "invocation-failed",
			originalHash,
			error instanceof Error ? error.message : String(error),
		);
	}
	const restored = await sourceWasRestored(pptxPath, originalBytes, originalHash);
	if (restored) {
		return unverified("source-mutated-restored", originalHash);
	}
	if (processResult.timedOut) {
		return unverified("process-timeout", originalHash);
	}
	const parsed = await readResult(resultPath);
	if (parsed === undefined || parsed.originalSha256 !== originalHash) {
		return unverified(processResult.exitCode === 0 ? "malformed-result" : "invocation-failed", originalHash);
	}
	if (processResult.exitCode !== 0 && parsed.status === "verified") {
		return unverified("invocation-failed", originalHash, processResult.stderr || "PowerPoint QA process failed.");
	}
	return parsed;
}
