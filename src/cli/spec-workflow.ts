import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

import { writeJsonExclusive } from "../io/atomic-json.js";
import type { AtomicPptxResult } from "../io/atomic-output.js";
import { runOfficeQa } from "../office-qa/adapter.js";
import type { OfficeQaResult } from "../office-qa/result.js";
import { ProviderNarrativeSchema, normalizeNarrative } from "../planner/normalize.js";
import { writeNarrativeDeck } from "../renderer/narrative-deck.js";
import {
	WorkflowOutputCollisionError,
	resolveWorkflowAssetRoot,
	resolveWorkflowOfficeQaScriptPath,
} from "./workflow.js";

export interface SpecWorkflowRequest {
	readonly specPath: string;
	readonly outputPath: string;
	readonly officeQa: boolean;
}

export interface SpecWorkflowResult {
	readonly integrity: AtomicPptxResult["integrity"];
	readonly officeQa: OfficeQaResult;
	readonly slideCount: number;
	readonly provenancePath: string;
}

export interface SpecWorkflowDependencies {
	readonly assetRoot?: string;
	readonly officeQaRunner?: (pptxPath: string, evidenceDirectory: string) => Promise<OfficeQaResult>;
	readonly now?: () => Date;
}

export class SpecInputError extends Error {
	readonly code = "KCH-E-SPEC-001" as const;

	constructor(message: string) {
		super(message);
		this.name = "SpecInputError";
	}
}

export const ConversationNarrativeSchema = ProviderNarrativeSchema.superRefine((document, context) => {
	for (const [index, slide] of document.slides.entries()) {
		if (slide.imageIntent.action !== "none") {
			context.addIssue({
				code: "custom",
				message: "대화형 생성에서는 이미지 선택이나 생성을 지원하지 않습니다.",
				path: ["slides", index, "imageIntent", "action"],
			});
		}
		if (slide.visual.type === "image") {
			context.addIssue({
				code: "custom",
				message: "대화형 생성에서는 이미지 시각 타입을 지원하지 않습니다.",
				path: ["slides", index, "visual", "type"],
			});
		}
	}
});

async function loadSpec(path: string): Promise<unknown> {
	let content: string;
	try {
		content = await readFile(path, "utf8");
	} catch {
		throw new SpecInputError("명세 파일을 읽을 수 없습니다");
	}
	try {
		return JSON.parse(content);
	} catch {
		throw new SpecInputError("명세 파일이 유효한 JSON이 아닙니다");
	}
}

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function disabledOfficeQa(originalSha256: string): OfficeQaResult {
	return {
		status: "render-unverified",
		reason: "disabled-by-user",
		originalSha256,
		detail: "Office QA disabled.",
		cleanup: { ownedProcesses: 0, ownedTempPaths: 0 },
	};
}

export async function runSpecWorkflow(
	request: SpecWorkflowRequest,
	dependencies: SpecWorkflowDependencies = {},
): Promise<SpecWorkflowResult> {
	const provenancePath = `${request.outputPath}.provenance.json`;
	if ((await exists(request.outputPath)) || (await exists(provenancePath))) {
		throw new WorkflowOutputCollisionError(request.outputPath);
	}
	const input = await loadSpec(request.specPath);
	const document = normalizeNarrative(ConversationNarrativeSchema.parse(input));
	const assetRoot = dependencies.assetRoot ?? resolveWorkflowAssetRoot();
	const logoPath = join(assetRoot, "logos", "KCH_LOGOV2.png");
	const panoramaPath = join(assetRoot, "panoramas", "shinan-wind-bottom.png");
	const panorama = await readFile(panoramaPath);
	const deck = await writeNarrativeDeck({
		targetPath: request.outputPath,
		document,
		assets: {
			logoPath,
			brandLockupPath: logoPath,
			panoramaData: `image/png;base64,${panorama.toString("base64")}`,
		},
	});
	const evidenceDirectory = `${request.outputPath}.office-qa`;
	const officeQa = request.officeQa
		? await (
				dependencies.officeQaRunner ??
				((pptxPath, directory) =>
					runOfficeQa({ pptxPath, evidenceDirectory: directory }, { scriptPath: resolveWorkflowOfficeQaScriptPath() }))
			)(request.outputPath, evidenceDirectory)
		: disabledOfficeQa(deck.integrity.sha256);
	await writeJsonExclusive(provenancePath, {
		source: "conversation",
		specPath: request.specPath,
		slideCount: document.slides.length,
		officeQaStatus: officeQa.status,
		pptxSha256: deck.integrity.sha256,
		createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
	});
	return {
		integrity: deck.integrity,
		officeQa,
		slideCount: document.slides.length,
		provenancePath,
	};
}
