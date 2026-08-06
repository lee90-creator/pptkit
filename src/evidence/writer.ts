import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { EvidenceManifest } from "./manifest.js";

export class EvidenceWriteError extends Error {
	readonly code = "KCH-E-OUTPUT-001" as const;

	constructor(
		readonly cleanupFailed: boolean,
		cause: unknown,
	) {
		super("증거 manifest를 원자적으로 기록하지 못했습니다.", { cause });
		this.name = "EvidenceWriteError";
	}
}

export interface EvidenceWriterDependencies {
	readonly renameFile?: (sourcePath: string, targetPath: string) => Promise<void>;
	readonly removeFile?: (temporaryPath: string) => Promise<void>;
}

export async function writeEvidenceManifest(
	targetPath: string,
	manifest: EvidenceManifest,
	dependencies: EvidenceWriterDependencies = {},
): Promise<void> {
	const directory = path.dirname(targetPath);
	await mkdir(directory, { recursive: true });
	const temporaryPath = path.join(directory, `.${path.basename(targetPath)}.kch-tmp-${randomUUID()}`);
	const removeFile = dependencies.removeFile ?? ((ownedPath: string) => rm(ownedPath, { force: true }));
	let promoted = false;
	let failed = false;
	let operationError: unknown;
	try {
		await writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
		await (dependencies.renameFile ?? rename)(temporaryPath, targetPath);
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
				throw new EvidenceWriteError(true, new AggregateError([operationError, firstCleanupError, secondCleanupError]));
			}
		}
	}
	if (failed) {
		throw new EvidenceWriteError(false, operationError);
	}
}
