import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export interface DistributionReceipt {
	readonly schemaVersion: 1;
	readonly lockSha256: string;
	readonly sourceSha256: string;
	readonly files: readonly { readonly path: string; readonly sha256: string }[];
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function receiptPath(root: string, path: string): string {
	const target = resolve(root, path);
	if (target !== resolve(root) && !target.startsWith(`${resolve(root)}${sep}`)) {
		throw new Error(`receipt path escapes distribution: ${path}`);
	}
	return target;
}

export async function walkDistribution(root: string, prefix = ""): Promise<string[]> {
	const entries = await readdir(join(root, prefix), { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const child = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...(await walkDistribution(root, child)));
		else if (entry.isFile()) files.push(child);
	}
	return files;
}

export async function verifiedDistributionReceipt(
	output: string,
	lockSha256: string,
	sourceSha256: string,
): Promise<DistributionReceipt | undefined> {
	try {
		const parsed = JSON.parse(await readFile(join(output, "dist/manifest.json"), "utf8")) as DistributionReceipt;
		if (
			parsed.schemaVersion !== 1 ||
			parsed.lockSha256 !== lockSha256 ||
			parsed.sourceSha256 !== sourceSha256 ||
			!Array.isArray(parsed.files)
		) {
			return undefined;
		}
		for (const file of parsed.files) {
			if (!file.path || sha256(await readFile(receiptPath(output, file.path))) !== file.sha256) return undefined;
		}
		return parsed;
	} catch {
		return undefined;
	}
}

export async function verifiedPayloadStage(output: string, lockSha256: string): Promise<boolean> {
	try {
		const parsed = JSON.parse(await readFile(join(output, "dist/manifest.json"), "utf8")) as DistributionReceipt;
		if (parsed.lockSha256 !== lockSha256 || !Array.isArray(parsed.files)) return false;
		const payloadFiles = parsed.files.filter(
			(file) =>
				file.path.startsWith(".payloads/") ||
				file.path.startsWith("dist/runtime/") ||
				file.path.startsWith("dist/tools/"),
		);
		if (payloadFiles.length === 0) return false;
		for (const file of payloadFiles) {
			if (sha256(await readFile(receiptPath(output, file.path))) !== file.sha256) return false;
		}
		return true;
	} catch {
		return false;
	}
}
