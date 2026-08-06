import type { z } from "zod";

import { type EnsureClaudeConsentRequest, ensureClaudeConsent } from "../consent/claude.js";
import { ClaudeEnvelopeError, extractClaudeStructuredOutput } from "./claude-envelope.js";
import type { ProcessResult, ProcessRunner, ProviderName } from "./contract.js";

export type ClaudeAdapterErrorCode = "KCH-E-CLAUDE-001" | "KCH-E-CLAUDE-002" | "KCH-E-CLAUDE-003";

export class ClaudeAdapterError extends Error {
	constructor(
		readonly code: ClaudeAdapterErrorCode,
		message: string,
	) {
		super(message);
		this.name = "ClaudeAdapterError";
	}
}

export interface ExecuteClaudeRequest<T> extends EnsureClaudeConsentRequest {
	readonly executable: string;
	readonly prompt: string;
	readonly outputSchema: z.ZodType<T>;
	readonly jsonSchema: string;
	readonly runner: ProcessRunner;
	readonly timeoutMs: number;
	readonly workingDirectory?: string;
}

export interface ClaudeAdapterResult<T> {
	readonly provider: "claude";
	readonly value: T;
}

export async function executeClaude<T>(request: ExecuteClaudeRequest<T>): Promise<ClaudeAdapterResult<T>> {
	await ensureClaudeConsent(request);

	let result: ProcessResult;
	try {
		result = await request.runner.run({
			command: request.executable,
			args: ["-p", "--output-format", "json", "--json-schema", request.jsonSchema],
			...(request.workingDirectory === undefined ? {} : { cwd: request.workingDirectory }),
			stdin: request.prompt,
			timeoutMs: request.timeoutMs,
		});
	} catch {
		throw new ClaudeAdapterError(
			"KCH-E-CLAUDE-001",
			"Claude CLI를 실행하지 못했습니다. 설치 상태와 실행 권한을 확인하세요.",
		);
	}
	if (result.timedOut) {
		throw new ClaudeAdapterError(
			"KCH-E-CLAUDE-001",
			"Claude 응답 시간이 초과되었습니다. 네트워크 상태를 확인한 뒤 다시 실행하세요.",
		);
	}
	if (result.exitCode !== 0) {
		throw new ClaudeAdapterError(
			"KCH-E-CLAUDE-001",
			"Claude CLI 실행이 실패했습니다. Claude 로그인 상태를 확인한 뒤 다시 실행하세요.",
		);
	}

	let structuredOutput: unknown;
	try {
		structuredOutput = extractClaudeStructuredOutput(result.stdout);
	} catch (error) {
		if (error instanceof ClaudeEnvelopeError) {
			throw new ClaudeAdapterError(error.code, error.message);
		}
		throw error;
	}
	const validated = request.outputSchema.safeParse(structuredOutput);
	if (!validated.success) {
		throw new ClaudeAdapterError("KCH-E-CLAUDE-003", "Claude의 구조화 응답이 요청한 데이터 계약을 충족하지 않습니다.");
	}
	return { provider: "claude", value: validated.data };
}

export async function executeClaudeIfSelected<T>(
	selectedProvider: ProviderName,
	request: ExecuteClaudeRequest<T>,
): Promise<ClaudeAdapterResult<T> | { readonly provider: "codex"; readonly skippedClaude: true }> {
	if (selectedProvider === "codex") {
		return { provider: "codex", skippedClaude: true };
	}
	return executeClaude(request);
}
