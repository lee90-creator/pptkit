import PptxGenJS from "pptxgenjs";

import { writeAtomicPptx } from "../io/atomic-output.js";
import type { AtomicPptxRequest, AtomicPptxResult } from "../io/atomic-output.js";
import { lintDeck } from "../lint/report.js";
import type { SlideLintInput } from "../lint/report.js";
import { buildCorpusSlides } from "./corpus.js";
import type { CorpusAssets } from "./corpus.js";
import { renderCorpusSlide } from "./slide.js";

export { buildCorpusSlides };

export class RendererLintError extends Error {
	readonly code = "KCH-E-DESIGN-001" as const;

	constructor(readonly blockers: ReturnType<typeof lintDeck>["blockers"]) {
		super(`렌더링 전 구조 검사에서 ${blockers.length}개의 차단 오류가 발견되었습니다.`);
		this.name = "RendererLintError";
	}
}

export interface WriteCorpusDeckRequest {
	readonly targetPath: string;
	readonly assets: CorpusAssets;
	readonly mutateLint?: (slides: readonly SlideLintInput[]) => readonly SlideLintInput[];
	readonly writeAtomic?: (request: AtomicPptxRequest) => Promise<AtomicPptxResult>;
}

export async function writeCorpusDeck(request: WriteCorpusDeckRequest): Promise<AtomicPptxResult> {
	const slides = buildCorpusSlides(request.assets);
	const lintInputs = request.mutateLint
		? request.mutateLint(slides.map((slide) => slide.lint))
		: slides.map((slide) => slide.lint);
	const report = lintDeck(lintInputs);
	if (report.blockers.length > 0) {
		throw new RendererLintError(report.blockers);
	}
	const writeAtomic = request.writeAtomic ?? writeAtomicPptx;
	return writeAtomic({
		targetPath: request.targetPath,
		generate: async (temporaryPath) => {
			const presentation = new PptxGenJS();
			presentation.layout = "LAYOUT_WIDE";
			presentation.author = "KCH";
			presentation.company = "KCH";
			presentation.title = "KCH renderer corpus";
			for (const [index, slide] of slides.entries()) {
				renderCorpusSlide(presentation, slide, request.assets, index + 1);
			}
			await presentation.writeFile({ fileName: temporaryPath });
		},
	});
}
