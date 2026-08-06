export type CodexProtocolErrorCode = "KCH-E-CODEX-002" | "KCH-E-CODEX-003";

export class CodexProtocolError extends Error {
	constructor(
		readonly code: CodexProtocolErrorCode,
		message: string,
	) {
		super(message);
		this.name = "CodexProtocolError";
	}
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Readonly<Record<string, unknown>>;
}

export function extractCompletedCodexMessage(jsonl: string): string {
	let completed = false;
	let finalMessage: string | undefined;

	for (const line of jsonl.split(/\r?\n/u)) {
		if (line.trim() === "") {
			continue;
		}
		let event: unknown;
		try {
			event = JSON.parse(line);
		} catch {
			throw new CodexProtocolError("KCH-E-CODEX-002", "Codex 응답 스트림의 JSONL 형식이 올바르지 않습니다.");
		}
		const record = asRecord(event);
		if (record === undefined || typeof record.type !== "string") {
			continue;
		}
		if (record.type === "turn.failed") {
			throw new CodexProtocolError("KCH-E-CODEX-002", "Codex가 요청 처리를 완료하지 못했습니다.");
		}
		if (record.type === "turn.completed") {
			completed = true;
			continue;
		}
		if (record.type !== "item.completed") {
			continue;
		}
		const item = asRecord(record.item);
		if (item?.type === "agent_message" && typeof item.text === "string") {
			finalMessage = item.text;
		}
	}

	if (!completed) {
		throw new CodexProtocolError("KCH-E-CODEX-002", "Codex의 완료 이벤트를 받지 못했습니다. 다시 실행하세요.");
	}
	if (finalMessage === undefined) {
		throw new CodexProtocolError("KCH-E-CODEX-003", "Codex의 최종 구조화 응답이 없습니다.");
	}
	return finalMessage;
}
