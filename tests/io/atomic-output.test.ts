import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";

import { AtomicOutputError, writeAtomicPptx } from "../../src/io/atomic-output.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "kch-atomic-"));
	roots.push(root);
	return root;
}

async function pptxBuffer(options: { readonly contentTypes?: string } = {}): Promise<Buffer> {
	const zip = new JSZip();
	zip.file(
		"[Content_Types].xml",
		options.contentTypes ??
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

describe("atomic PPTX output", () => {
	test("promotes a validated PPTX from a unique sibling temp path", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		const observed: string[] = [];

		const result = await writeAtomicPptx({
			targetPath,
			generate: async (temporaryPath) => {
				observed.push(temporaryPath);
				await writeFile(temporaryPath, await pptxBuffer());
			},
		});

		expect(observed).toHaveLength(1);
		expect(path.dirname(observed[0] ?? "")).toBe(root);
		expect(result.targetPath).toBe(targetPath);
		expect(result.integrity.requiredParts).toEqual(["[Content_Types].xml", "ppt/presentation.xml"]);
		expect((await readFile(targetPath)).byteLength).toBeGreaterThan(0);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("accepts valid XML containing a greater-than character inside an attribute", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "attribute.pptx");
		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) =>
					writeFile(
						temporaryPath,
						await pptxBuffer({
							contentTypes:
								'<?xml version="1.0"?><Types><Default Extension="xml" ContentType="application/a>b"/></Types>',
						}),
					),
			}),
		).resolves.toMatchObject({ targetPath });
	});

	test("rejects malformed ZIP input and preserves an existing target byte-for-byte", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		const original = Buffer.from("existing-target");
		await writeFile(targetPath, original);

		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) => writeFile(temporaryPath, "not-a-zip"),
			}),
		).rejects.toBeInstanceOf(AtomicOutputError);

		expect(await readFile(targetPath)).toEqual(original);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("rejects corrupt content types and leaves no partial output", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		const original = Buffer.from("stable");
		await writeFile(targetPath, original);

		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) =>
					writeFile(temporaryPath, await pptxBuffer({ contentTypes: "<Types><Default></Types>" })),
			}),
		).rejects.toMatchObject({ code: "KCH-E-OUTPUT-001" });

		expect(await readFile(targetPath)).toEqual(original);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("never overwrites a target created after generation starts", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "race.pptx");
		const competing = Buffer.from("competing-output");

		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) => {
					await writeFile(temporaryPath, await pptxBuffer());
					await writeFile(targetPath, competing);
				},
			}),
		).rejects.toMatchObject({ code: "KCH-E-OUTPUT-001" });

		expect(await readFile(targetPath)).toEqual(competing);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("cleans the owned temp path when atomic rename fails", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		const original = Buffer.from("stable");
		await writeFile(targetPath, original);

		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) => writeFile(temporaryPath, await pptxBuffer()),
				renameFile: async () => {
					throw new Error("simulated rename failure");
				},
			}),
		).rejects.toMatchObject({ code: "KCH-E-OUTPUT-001" });

		expect(await readFile(targetPath)).toEqual(original);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("preserves the typed operation error and retries transient temp cleanup", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		let removeCalls = 0;

		await expect(
			writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) => writeFile(temporaryPath, "not-a-zip"),
				removeFile: async (temporaryPath) => {
					removeCalls += 1;
					if (removeCalls === 1) {
						throw new Error("transient cleanup failure");
					}
					await rm(temporaryPath, { force: true });
				},
			}),
		).rejects.toBeInstanceOf(AtomicOutputError);

		expect(removeCalls).toBe(2);
		expect(await siblingTemps(root)).toEqual([]);
	});

	test("reports permanent atomic cleanup failure with all original causes", async () => {
		const root = await workspace();
		const targetPath = path.join(root, "demo.pptx");
		try {
			await writeAtomicPptx({
				targetPath,
				generate: async (temporaryPath) => writeFile(temporaryPath, "not-a-zip"),
				removeFile: async () => {
					throw new Error("permanent cleanup failure");
				},
			});
			throw new Error("expected atomic output failure");
		} catch (error) {
			expect(error).toBeInstanceOf(AtomicOutputError);
			expect((error as AtomicOutputError).cleanupFailed).toBe(true);
			expect((error as Error).cause).toBeInstanceOf(AggregateError);
			expect(((error as Error).cause as AggregateError).errors).toHaveLength(3);
		}
	});
});
