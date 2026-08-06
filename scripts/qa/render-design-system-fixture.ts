import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

import { buildHeaderSkin, renderHeaderSkin } from "../../src/design-system/header-skins.js";
import { KCH_TOKENS } from "../../src/design-system/tokens.js";

const PANORAMA_SHA256 = "eaa69030ebd3c3b5268b9d7819f5c5468867c6c4bf0f946e00ffb30cf5873a16";
const PANORAMA_ENTRY = "ppt/media/image2.png";
const SOURCE_DECK = "260514_신안 해상풍력 일반산업단지 사업보고_PF 조기상환기준.pptx";

async function loadVerifiedPanoramaData(): Promise<string> {
	const archive = await JSZip.loadAsync(await readFile(resolve(SOURCE_DECK)));
	const entry = archive.file(PANORAMA_ENTRY);
	if (!entry) {
		throw new Error(`Missing approved panorama entry: ${PANORAMA_ENTRY}`);
	}
	const bytes = await entry.async("nodebuffer");
	const actualHash = createHash("sha256").update(bytes).digest("hex");
	if (actualHash !== PANORAMA_SHA256) {
		throw new Error(`Panorama SHA-256 mismatch: ${actualHash}`);
	}
	return `image/png;base64,${bytes.toString("base64")}`;
}

async function main(): Promise<void> {
	const outputPath = resolve(process.argv[2] ?? "/tmp/kch-design-fixture/header-skins.pptx");
	await mkdir(dirname(outputPath), { recursive: true });

	const presentation = new PptxGenJS();
	presentation.layout = "LAYOUT_WIDE";
	presentation.author = "KCH";
	presentation.company = "KCH";
	presentation.subject = "Reference header skin geometry QA";
	presentation.title = "KCH header skins";
	presentation.theme = {
		headFontFace: KCH_TOKENS.fonts.heading,
		bodyFontFace: KCH_TOKENS.fonts.body,
	};

	const assets = {
		logoPath: resolve("logo/KCH_LOGOV2.png"),
		brandLockupPath: resolve("logo/KCH_LOGOV2.png"),
		panoramaData: await loadVerifiedPanoramaData(),
	};

	const corporate = presentation.addSlide();
	corporate.background = { color: KCH_TOKENS.colors.background };
	renderHeaderSkin(
		corporate,
		buildHeaderSkin({
			skin: "kch-framed-right",
			title: "그룹 현황",
			sectionNumber: "01",
			usePanorama: false,
		}),
		assets,
	);
	corporate.addText("KCH 기업 모드 콘텐츠 영역", {
		x: 0.75,
		y: 2,
		w: 7,
		h: 0.5,
		fontFace: KCH_TOKENS.fonts.body,
		fontSize: KCH_TOKENS.fontSizes.bodyMinimum,
		color: KCH_TOKENS.colors.body,
	});

	const wind = presentation.addSlide();
	wind.background = { color: KCH_TOKENS.colors.background };
	renderHeaderSkin(
		wind,
		buildHeaderSkin({
			skin: "shinan-line-left",
			title: "사업 추진 현황",
			usePanorama: true,
		}),
		assets,
	);
	wind.addText("신안 풍력 산업 모드 콘텐츠 영역", {
		x: 0.75,
		y: 2,
		w: 7,
		h: 0.5,
		fontFace: KCH_TOKENS.fonts.body,
		fontSize: KCH_TOKENS.fontSizes.bodyMinimum,
		color: KCH_TOKENS.colors.body,
	});

	await presentation.writeFile({ fileName: outputPath });
	process.stdout.write(
		`${JSON.stringify({ outputPath, slides: 2, panoramaSha256: PANORAMA_SHA256, skins: ["kch-framed-right", "shinan-line-left"] })}\n`,
	);
}

await main();
