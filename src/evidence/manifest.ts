import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export interface ArtifactEvidence {
	readonly path: string;
	readonly bytes: number;
	readonly sha256: string;
}

export interface CleanupReceipt {
	readonly ownedProcesses: number;
	readonly ownedTempPaths: number;
}

export interface EvidenceManifest {
	readonly command: readonly string[];
	readonly startedAt: string;
	readonly endedAt: string;
	readonly exitCode: number;
	readonly stdoutPath: string;
	readonly stderrPath: string;
	readonly artifacts: readonly ArtifactEvidence[];
	readonly cleanup: CleanupReceipt;
}

export interface BuildEvidenceManifestRequest {
	readonly command: readonly string[];
	readonly startedAt: string;
	readonly endedAt: string;
	readonly exitCode: number;
	readonly stdoutPath: string;
	readonly stderrPath: string;
	readonly artifactPaths: readonly string[];
	readonly cleanup: CleanupReceipt;
}

async function inspectArtifact(filePath: string): Promise<ArtifactEvidence> {
	const bytes = await readFile(filePath);
	return {
		path: filePath,
		bytes: bytes.byteLength,
		sha256: createHash("sha256").update(bytes).digest("hex"),
	};
}

export async function buildEvidenceManifest(request: BuildEvidenceManifestRequest): Promise<EvidenceManifest> {
	const artifacts = await Promise.all(request.artifactPaths.map(inspectArtifact));
	return {
		command: [...request.command],
		startedAt: request.startedAt,
		endedAt: request.endedAt,
		exitCode: request.exitCode,
		stdoutPath: request.stdoutPath,
		stderrPath: request.stderrPath,
		artifacts,
		cleanup: request.cleanup,
	};
}
