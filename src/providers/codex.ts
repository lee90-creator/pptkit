import type { z } from "zod";

import { CodexProtocolError, extractCompletedCodexMessage } from "./codex-events.js";
import type { ProcessResult, ProcessRunner } from "./contract.js";

export type CodexAdapterErrorCode = "KCH-E-CODEX-001" | "KCH-E-CODEX-002" | "KCH-E-CODEX-003";

export class CodexAdapterError extends Error {
	constructor(
		readonly code: CodexAdapterErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CodexAdapterError";
	}
}

export interface ExecuteCodexRequest<T> {
	readonly executable: string;
	readonly prompt: string;
	readonly outputSchema: z.ZodType<T>;
	readonly jsonSchemaPath: string;
	readonly runner: ProcessRunner;
	readonly timeoutMs: number;
	readonly workingDirectory?: string;
}

export interface CodexAdapterResult<T> {
	readonly provider: "codex";
	readonly value: T;
}

export async function executeCodex<T>(request: ExecuteCodexRequest<T>): Promise<CodexAdapterResult<T>> {
	let processResult: ProcessResult;
	try {
		processResult = await request.runner.run({
			command: request.executable,
			args: [
				"exec",
				"--json",
				"--ephemeral",
				"--skip-git-repo-check",
				"--sandbox",
				"read-only",
				"--output-schema",
				request.jsonSchemaPath,
				"-",
			],
			...(request.workingDirectory === undefined ? {} : { cwd: request.workingDirectory }),
			stdin: request.prompt,
			timeoutMs: request.timeoutMs,
		});
	} catch {
		throw new CodexAdapterError(
			"KCH-E-CODEX-001",
			"Codex CLI를 실행하지 못했습니다. 설치 상태와 실행 권한을 확인하세요.",
		);
	}

	if (processResult.timedOut) {
		throw new CodexAdapterError(
			"KCH-E-CODEX-001",
			"Codex 응답 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 실행하세요.",
		);
	}
	if (processResult.exitCode !== 0) {
		const detail = (processResult.stderr.trim() || processResult.stdout.trim().slice(-500)).slice(0, 500);
		throw new CodexAdapterError(
			"KCH-E-CODEX-001",
			`Codex CLI 실행이 실패했습니다. Codex 로그인 상태를 확인한 뒤 다시 실행하세요.${detail ? ` 상세: ${detail}` : ""}`,
		);
	}

	let finalMessage: string;
	try {
		finalMessage = extractCompletedCodexMessage(processResult.stdout);
	} catch (error) {
		if (error instanceof CodexProtocolError) {
			throw new CodexAdapterError(error.code, error.message);
		}
		throw error;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(finalMessage);
	} catch {
		throw new CodexAdapterError("KCH-E-CODEX-003", "Codex의 최종 응답이 유효한 JSON이 아닙니다.");
	}
	const validated = request.outputSchema.safeParse(parsed);
	if (!validated.success) {
		const detail = validated.error.issues
			.slice(0, 3)
			.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
			.join("; ");
		throw new CodexAdapterError(
			"KCH-E-CODEX-003",
			`Codex의 최종 응답이 요청한 데이터 계약을 충족하지 않습니다.${detail ? ` 상세: ${detail}` : ""}`,
		);
	}
	return { provider: "codex", value: validated.data };
}
