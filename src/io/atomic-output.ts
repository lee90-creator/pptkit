import { randomUUID } from "node:crypto";
import { link, mkdir, rm } from "node:fs/promises";
import path from "node:path";

import { type PptxIntegrity, inspectPptxIntegrity } from "./pptx-integrity.js";

export class AtomicOutputError extends Error {
	readonly code = "KCH-E-OUTPUT-001" as const;

	constructor(
		readonly cleanupFailed: boolean,
		cause: unknown,
	) {
		super("PPTX 출력 검증 또는 원자적 저장에 실패했습니다. 기존 출력 파일은 변경되지 않았습니다.", {
			cause,
		});
		this.name = "AtomicOutputError";
	}
}

export interface AtomicPptxRequest {
	readonly targetPath: string;
	readonly generate: (temporaryPath: string) => Promise<void>;
	readonly renameFile?: (sourcePath: string, targetPath: string) => Promise<void>;
	readonly removeFile?: (temporaryPath: string) => Promise<void>;
}

export interface AtomicPptxResult {
	readonly targetPath: string;
	readonly integrity: PptxIntegrity;
}

function temporarySiblingPath(targetPath: string): string {
	const directory = path.dirname(targetPath);
	const name = path.basename(targetPath);
	return path.join(directory, `.${name}.kch-tmp-${randomUUID()}.pptx`);
}

async function promoteWithoutOverwrite(sourcePath: string, targetPath: string): Promise<void> {
	await link(sourcePath, targetPath);
	await rm(sourcePath);
}

export async function writeAtomicPptx(request: AtomicPptxRequest): Promise<AtomicPptxResult> {
	const directory = path.dirname(request.targetPath);
	await mkdir(directory, { recursive: true });
	const temporaryPath = temporarySiblingPath(request.targetPath);
	const removeFile = request.removeFile ?? ((ownedPath: string) => rm(ownedPath, { force: true }));
	let promoted = false;
	let failed = false;
	let operationError: unknown;
	let integrity: PptxIntegrity | undefined;
	try {
		await request.generate(temporaryPath);
		integrity = await inspectPptxIntegrity(temporaryPath);
		await (request.renameFile ?? promoteWithoutOverwrite)(temporaryPath, request.targetPath);
		promoted = true;
	} catch (error) {
		failed = true;
		operationError = error;
	}
	if (!promoted) {
		try {
			await removeFile(temporaryPath);
		} catch (firstCleanupError) {
			try {
				await removeFile(temporaryPath);
			} catch (secondCleanupError) {
				throw new AtomicOutputError(true, new AggregateError([operationError, firstCleanupError, secondCleanupError]));
			}
		}
	}
	if (failed || integrity === undefined) {
		throw new AtomicOutputError(false, operationError);
	}
	return { targetPath: request.targetPath, integrity };
}
