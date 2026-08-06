import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { buildEvidenceManifest } from "../../src/evidence/manifest.js";
import { EvidenceWriteError, writeEvidenceManifest } from "../../src/evidence/writer.js";
import { inspectPptxIntegrity } from "../../src/io/pptx-integrity.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "kch-evidence-"));
	roots.push(root);
	return root;
}

async function pptxBuffer(): Promise<Buffer> {
	const zip = new JSZip();
	zip.file(
		"[Content_Types].xml",
		'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
	);
	zip.file(
		"ppt/presentation.xml",
		'<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>',
	);
	return zip.generateAsync({ type: "nodebuffer" });
}

async function siblingTemps(directory: string): Promise<string[]> {
	return (await readdir(directory)).filter((name) => name.includes(".kch-tmp-"));
}

describe("evidence manifests", () => {
	test("records command timing logs artifact hashes and cleanup receipt", async () => {
		const root = await workspace();
		const artifactPath = path.join(root, "demo.pptx");
		const stdoutPath = path.join(root, "stdout.log");
		const stderrPath = path.join(root, "stderr.log");
		await writeFile(artifactPath, await pptxBuffer());
		await writeFile(stdoutPath, "success");
		await writeFile(stderrPath, "");

		const manifest = await buildEvidenceManifest({
			command: ["dist\\run.bat", "--demo"],
			startedAt: "2026-08-03T00:00:00.000Z",
			endedAt: "2026-08-03T00:00:01.000Z",
			exitCode: 0,
			stdoutPath,
			stderrPath,
			artifactPaths: [artifactPath],
			cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
		});
		const expectedHash = createHash("sha256")
			.update(await readFile(artifactPath))
			.digest("hex");
		expect(manifest.artifacts).toEqual([
			{ path: artifactPath, bytes: (await readFile(artifactPath)).byteLength, sha256: expectedHash },
		]);

		const manifestPath = path.join(root, "manifest.json");
		await writeEvidenceManifest(manifestPath, manifest);
		expect(JSON.parse(await readFile(manifestPath, "utf8"))).toEqual(manifest);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("integrity inspection rejects a ZIP missing required presentation parts", async () => {
		const root = await workspace();
		const invalidPath = path.join(root, "missing.pptx");
		const zip = new JSZip();
		zip.file("[Content_Types].xml", "<Types/>");
		await writeFile(invalidPath, await zip.generateAsync({ type: "nodebuffer" }));
		await expect(inspectPptxIntegrity(invalidPath)).rejects.toMatchObject({ code: "KCH-E-OUTPUT-001" });
	});

	test("evidence writer preserves its typed error through transient cleanup failure", async () => {
		const root = await workspace();
		const manifestPath = path.join(root, "manifest.json");
		let removeCalls = 0;
		const manifest = await buildEvidenceManifest({
			command: ["demo"],
			startedAt: "2026-08-03T00:00:00.000Z",
			endedAt: "2026-08-03T00:00:01.000Z",
			exitCode: 0,
			stdoutPath: "stdout.log",
			stderrPath: "stderr.log",
			artifactPaths: [],
			cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
		});
		await expect(
			writeEvidenceManifest(manifestPath, manifest, {
				renameFile: async () => {
					throw new Error("rename failed");
				},
				removeFile: async (temporaryPath) => {
					removeCalls += 1;
					if (removeCalls === 1) throw new Error("transient cleanup failure");
					await rm(temporaryPath, { force: true });
				},
			}),
		).rejects.toBeInstanceOf(EvidenceWriteError);
		expect(removeCalls).toBe(2);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("reports permanent evidence cleanup failure with all original causes", async () => {
		const root = await workspace();
		const manifestPath = path.join(root, "manifest.json");
		const manifest = await buildEvidenceManifest({
			command: ["demo"],
			startedAt: "2026-08-03T00:00:00.000Z",
			endedAt: "2026-08-03T00:00:01.000Z",
			exitCode: 1,
			stdoutPath: "stdout.log",
			stderrPath: "stderr.log",
			artifactPaths: [],
			cleanup: { ownedProcesses: 0, ownedTempPaths: 1 },
		});
		try {
			await writeEvidenceManifest(manifestPath, manifest, {
				renameFile: async () => {
					throw new Error("rename failed");
				},
				removeFile: async () => {
					throw new Error("permanent cleanup failure");
				},
			});
			throw new Error("expected evidence write failure");
		} catch (error) {
			expect(error).toBeInstanceOf(EvidenceWriteError);
			expect((error as EvidenceWriteError).cleanupFailed).toBe(true);
			expect((error as Error).cause).toBeInstanceOf(AggregateError);
			expect(((error as Error).cause as AggregateError).errors).toHaveLength(3);
		}
	});
});
