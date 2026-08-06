import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const CONSENT_FLAG = "--accept-claude-subscription-use";

export const ClaudeConsentReceiptSchema = z
	.object({
		policy: z.literal("claude-subscription-reuse"),
		version: z.literal(1),
		acceptedAt: z.string().refine((value) => {
			const parsed = new Date(value);
			return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
		}),
	})
	.strict();

export type ClaudeConsentReceipt = z.infer<typeof ClaudeConsentReceiptSchema>;

export class ClaudeConsentError extends Error {
	readonly code = "KCH-E-CONSENT-001" as const;

	constructor(readonly rerunCommand: string) {
		super(`Claude 구독 인증 재사용에 대한 명시적 동의가 필요합니다. 다음 명령으로 다시 실행하세요: ${rerunCommand}`);
		this.name = "ClaudeConsentError";
	}
}

export interface EnsureClaudeConsentRequest {
	readonly localAppData: string;
	readonly accept?: boolean;
	readonly rerunCommand: string;
	readonly now?: () => Date;
}

export function claudeConsentPath(localAppData: string): string {
	return path.join(localAppData, "KCH", "PptAutomation", "consent", "claude-subscription-v1.json");
}

function withConsentFlag(command: string): string {
	return command.includes(CONSENT_FLAG) ? command : `${command} ${CONSENT_FLAG}`;
}

async function readValidReceipt(receiptPath: string): Promise<ClaudeConsentReceipt | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(receiptPath, "utf8"));
		const receipt = ClaudeConsentReceiptSchema.safeParse(parsed);
		return receipt.success ? receipt.data : undefined;
	} catch {
		return undefined;
	}
}

async function writeReceiptAtomically(receiptPath: string, receipt: ClaudeConsentReceipt): Promise<void> {
	const directory = path.dirname(receiptPath);
	await mkdir(directory, { recursive: true });
	const temporaryPath = path.join(directory, `.${path.basename(receiptPath)}.${process.pid}.${randomUUID()}.tmp`);
	try {
		await writeFile(temporaryPath, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", flag: "wx" });
		await rename(temporaryPath, receiptPath);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

export async function ensureClaudeConsent(request: EnsureClaudeConsentRequest): Promise<ClaudeConsentReceipt> {
	const receiptPath = claudeConsentPath(request.localAppData);
	const existing = await readValidReceipt(receiptPath);
	if (existing !== undefined) {
		return existing;
	}
	if (request.accept !== true) {
		throw new ClaudeConsentError(withConsentFlag(request.rerunCommand));
	}
	const receipt = ClaudeConsentReceiptSchema.parse({
		policy: "claude-subscription-reuse",
		version: 1,
		acceptedAt: (request.now ?? (() => new Date()))().toISOString(),
	});
	await writeReceiptAtomically(receiptPath, receipt);
	return receipt;
}
