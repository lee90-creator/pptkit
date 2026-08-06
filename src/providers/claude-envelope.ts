export class ClaudeEnvelopeError extends Error {
	readonly code = "KCH-E-CLAUDE-002" as const;

	constructor(message: string) {
		super(message);
		this.name = "ClaudeEnvelopeError";
	}
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		return undefined;
	}
	return value as Readonly<Record<string, unknown>>;
}

function parseRecords(output: string): readonly unknown[] {
	try {
		return [JSON.parse(output)];
	} catch {
		const records: unknown[] = [];
		for (const line of output.split(/\r?\n/u)) {
			if (line.trim() === "") {
				continue;
			}
			try {
				records.push(JSON.parse(line));
			} catch {
				throw new ClaudeEnvelopeError("Claude 응답의 JSON 또는 NDJSON 형식이 올바르지 않습니다.");
			}
		}
		return records;
	}
}

export function extractClaudeStructuredOutput(output: string): unknown {
	const records = parseRecords(output);
	let result: Readonly<Record<string, unknown>> | undefined;
	for (let index = records.length - 1; index >= 0; index -= 1) {
		const record = asRecord(records[index]);
		if (record?.type === "result") {
			result = record;
			break;
		}
	}
	if (result === undefined || result.is_error === true || result.subtype !== "success") {
		throw new ClaudeEnvelopeError("Claude가 구조화 응답 생성을 완료하지 못했습니다.");
	}
	if (!("structured_output" in result)) {
		throw new ClaudeEnvelopeError("Claude 응답에 structured_output이 없습니다.");
	}
	return result.structured_output;
}
