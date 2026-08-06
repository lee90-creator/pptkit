import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "bun:test";
import JSZip from "jszip";

import { lintDeck } from "../../src/lint/report.js";
import { RendererLintError, buildCorpusSlides, writeCorpusDeck } from "../../src/renderer/deck.js";
import { RENDERER_CORPUS_KINDS } from "../../src/renderer/diagrams.js";

const PIXEL_DATA =
	"image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const ASSETS = {
	logoPath: resolve("logo/KCH_LOGOV2.png"),
	brandLockupPath: resolve("logo/KCH_LOGOV2.png"),
	panoramaData: PIXEL_DATA,
	imageCallout: {
		assetId: "kch-wordmark",
		path: resolve("logo/KCH_LOGOV2.png"),
		pixelWidth: 458,
		pixelHeight: 246,
		provenance: {
			source: "provided" as const,
			identifier: "logo/KCH_LOGOV2.png",
			licenseStatus: "internal-use-only",
		},
	},
};

describe("17-kind renderer corpus deck", () => {
	test("builds every exact corpus kind with a clean located lint surface", () => {
		const slides = buildCorpusSlides(ASSETS);
		expect(slides.map((slide) => slide.kind)).toEqual([...RENDERER_CORPUS_KINDS]);
		expect(slides[2]?.title).toBe("그룹 현황");
		expect(slides.at(-1)?.kind).toBe("closing");
		expect(lintDeck(slides.map((slide) => slide.lint))).toEqual({ blockers: [] });
	});

	test("detects one seeded blocker per kind with no unexpected rules", () => {
		const slides = buildCorpusSlides(ASSETS);
		const seeded = slides.map((slide, index) => ({
			...slide.lint,
			objects: [
				...slide.lint.objects,
				{
					id: `seed-${index}`,
					kind: "shape" as const,
					nativeObject: "shape" as const,
					bounds: { x: 13, y: 7, width: 1, height: 1 },
					role: "seed",
					collisionGroup: `seed-${index}`,
				},
			],
		}));
		const report = lintDeck(seeded);
		const seededIssues = report.blockers.filter((issue) => issue.objectId.startsWith("seed-"));
		const unexpected = report.blockers.filter((issue) => !issue.objectId.startsWith("seed-"));
		expect(seededIssues).toHaveLength(RENDERER_CORPUS_KINDS.length);
		expect(seededIssues.every((issue) => issue.rule === "bounds")).toBe(true);
		expect(unexpected).toEqual([]);
	});

	test("blocks before generation and preserves an existing target", async () => {
		const root = await mkdtemp(join(tmpdir(), "kch-deck-lint-"));
		const targetPath = join(root, "existing.pptx");
		await writeFile(targetPath, "existing");
		const before = createHash("sha256")
			.update(await readFile(targetPath))
			.digest("hex");
		let atomicWriterCalled = false;
		try {
			await expect(
				writeCorpusDeck({
					targetPath,
					assets: ASSETS,
					mutateLint: (slides) => {
						const first = slides[0];
						if (!first) {
							throw new Error("missing first corpus slide");
						}
						return [
							{
								...first,
								objects: [
									...first.objects,
									{
										id: "blocked",
										kind: "shape",
										nativeObject: "shape",
										bounds: { x: 20, y: 20, width: 1, height: 1 },
										role: "seed",
										collisionGroup: "seed",
									},
								],
							},
							...slides.slice(1),
						];
					},
					writeAtomic: async () => {
						atomicWriterCalled = true;
						throw new Error("must not run");
					},
				}),
			).rejects.toBeInstanceOf(RendererLintError);
			expect(atomicWriterCalled).toBe(false);
			expect(
				createHash("sha256")
					.update(await readFile(targetPath))
					.digest("hex"),
			).toBe(before);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	test("atomically writes a native 17-slide PPTX without SmartArt", async () => {
		const root = await mkdtemp(join(tmpdir(), "kch-deck-green-"));
		const targetPath = join(root, "corpus.pptx");
		try {
			const result = await writeCorpusDeck({ targetPath, assets: ASSETS });
			expect(result.integrity.bytes).toBeGreaterThan(0);
			const archive = await JSZip.loadAsync(await readFile(targetPath), { checkCRC32: true });
			const slideParts = Object.keys(archive.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name));
			const chartParts = Object.keys(archive.files).filter((name) => /^ppt\/charts\/chart\d+\.xml$/.test(name));
			const smartArtParts = Object.keys(archive.files).filter((name) => name.startsWith("ppt/diagrams/"));
			expect(slideParts).toHaveLength(17);
			expect(chartParts.length).toBeGreaterThanOrEqual(1);
			expect(smartArtParts).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
