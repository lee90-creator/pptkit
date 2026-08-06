import { randomUUID } from "node:crypto";
import { link, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export class AtomicJsonCollisionError extends Error {
	readonly code = "KCH-E-OUTPUT-002" as const;

	constructor(targetPath: string) {
		super(`출력 또는 검증 영수증이 이미 존재합니다: ${targetPath}`);
		this.name = "AtomicJsonCollisionError";
	}
}

export class AtomicJsonWriteError extends Error {
	readonly code = "KCH-E-OUTPUT-003" as const;

	constructor(cause: unknown) {
		super("검증 영수증을 안전하게 저장하지 못했습니다.", { cause });
		this.name = "AtomicJsonWriteError";
	}
}

function temporarySiblingPath(targetPath: string): string {
	return path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.kch-tmp-${randomUUID()}`);
}

function isAlreadyExists(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "EEXIST";
}

export async function writeJsonExclusive(targetPath: string, value: unknown): Promise<void> {
	await mkdir(path.dirname(targetPath), { recursive: true });
	const temporaryPath = temporarySiblingPath(targetPath);
	try {
		await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
		await link(temporaryPath, targetPath);
		await rm(temporaryPath);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		if (isAlreadyExists(error)) throw new AtomicJsonCollisionError(targetPath);
		throw new AtomicJsonWriteError(error);
	}
}
