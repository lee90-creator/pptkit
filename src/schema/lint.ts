import { z } from "zod";

export const DomainErrorCodeSchema = z.enum([
	"KCH-E-SCHEMA-001",
	"KCH-E-SCHEMA-002",
	"KCH-E-SCHEMA-003",
	"KCH-E-SCHEMA-004",
	"KCH-E-SCHEMA-005",
	"KCH-E-SCHEMA-006",
	"KCH-E-ASSET-001",
	"KCH-E-ASSET-002",
	"KCH-E-ASSET-003",
	"KCH-E-ASSET-004",
	"KCH-E-ASSET-005",
	"KCH-E-PROVIDER-001",
	"KCH-E-CODEX-001",
	"KCH-E-CODEX-002",
	"KCH-E-CODEX-003",
	"KCH-E-CLAUDE-001",
	"KCH-E-CLAUDE-002",
	"KCH-E-CLAUDE-003",
	"KCH-E-CONSENT-001",
	"KCH-E-CAPACITY-001",
	"KCH-E-BOOTSTRAP-001",
	"KCH-E-OUTPUT-001",
	"KCH-E-DESIGN-001",
]);

export type DomainErrorCode = z.infer<typeof DomainErrorCodeSchema>;

export class DomainBoundaryError extends Error {
	constructor(readonly code: DomainErrorCode) {
		super(`입력 데이터가 KCH 자동화 계약을 충족하지 않습니다 (${code}).`);
		this.name = "DomainBoundaryError";
	}
}

export function parseDomainBoundary<T>(schema: z.ZodType<T>, input: unknown, code: DomainErrorCode): T {
	const parsed = schema.safeParse(input);
	if (!parsed.success) {
		throw new DomainBoundaryError(code);
	}
	return parsed.data;
}
