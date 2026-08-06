import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import { buildHeaderSkin, renderHeaderSkin } from "../../src/design-system/header-skins.js";
import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { writeAtomicPptx } from "../../src/io/atomic-output.js";
import { planChart, renderChart } from "../../src/renderer/charts.js";
import { writeCorpusDeck } from "../../src/renderer/deck.js";

const PANORAMA_SHA256 = "eaa69030ebd3c3b5268b9d7819f5c5468867c6c4bf0f946e00ffb30cf5873a16";
const SOURCE_DECK = "260514_신안 해상풍력 일반산업단지 사업보고_PF 조기상환기준.pptx";

async function panoramaData(): Promise<string> {
	const archive = await JSZip.loadAsync(await readFile(resolve(SOURCE_DECK)));
	const entry = archive.file("ppt/media/image2.png");
	if (!entry) {
		throw new Error("Missing approved panorama entry.");
	}
	const bytes = await entry.async("nodebuffer");
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (actual !== PANORAMA_SHA256) {
		throw new Error(`Panorama SHA-256 mismatch: ${actual}`);
	}
	return `image/png;base64,${bytes.toString("base64")}`;
}

async function writeChartGallery(targetPath: string, logoPath: string): Promise<void> {
	const types = ["bar", "line", "area", "donut"] as const;
	await writeAtomicPptx({
		targetPath,
		generate: async (temporaryPath) => {
			const presentation = new PptxGenJS();
			presentation.layout = "LAYOUT_WIDE";
			for (const type of types) {
				const slide = presentation.addSlide();
				slide.background = { color: KCH_TOKENS.colors.background };
				renderHeaderSkin(
					slide,
					buildHeaderSkin({
						skin: "kch-framed-right",
						title: `${type.toUpperCase()} 차트`,
						sectionNumber: "13",
						usePanorama: false,
					}),
					{ logoPath, brandLockupPath: logoPath },
				);
				const decision = planChart({
					chartType: type,
					categories: ["1분기", "2분기", "3분기", "4분기"],
					series: [
						{ name: "매출", values: [120, 138, 151, 164] },
						{ name: "영업이익", values: [11, 14, 18, 21] },
					],
					unit: "억 원",
				});
				if (decision.status !== "render") {
					throw new Error(`${type} chart gallery fixture did not fit.`);
				}
				renderChart(slide, decision.plan);
			}
			await presentation.writeFile({ fileName: temporaryPath });
		},
	});
}

async function main(): Promise<void> {
	const outputDirectory = resolve(process.argv[2] ?? "/tmp/kch-renderer-qa");
	const logoPath = resolve("logo/KCH_LOGOV2.png");
	const panorama = await panoramaData();
	const corpusPath = join(outputDirectory, "renderer-corpus.pptx");
	const chartPath = join(outputDirectory, "chart-gallery.pptx");
	const corpus = await writeCorpusDeck({
		targetPath: corpusPath,
		assets: {
			logoPath,
			brandLockupPath: logoPath,
			panoramaData: panorama,
			imageCallout: {
				assetId: "kch-wordmark",
				path: logoPath,
				pixelWidth: 458,
				pixelHeight: 246,
				provenance: {
					source: "provided",
					identifier: "logo/KCH_LOGOV2.png",
					licenseStatus: "internal-use-only",
				},
			},
		},
	});
	await writeChartGallery(chartPath, logoPath);
	process.stdout.write(
		`${JSON.stringify({
			corpusPath,
			corpusSha256: corpus.integrity.sha256,
			corpusBytes: corpus.integrity.bytes,
			chartPath,
			panoramaSha256: PANORAMA_SHA256,
		})}\n`,
	);
}

await main();
