import { access, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import DEMO_BRIEF from "../../examples/demo.json" with { type: "json" };
import { resolveImageAsset } from "../images/provider.js";
import type { ImagePipelineDependencies } from "../images/provider.js";
import { writeJsonExclusive } from "../io/atomic-json.js";
import type { AtomicPptxResult } from "../io/atomic-output.js";
import { resolveOfficeQaScriptPath, runOfficeQa } from "../office-qa/adapter.js";
import type { OfficeQaResult } from "../office-qa/result.js";
import { planNarrative } from "../planner/plan.js";
import { buildPlannerPrompt } from "../planner/prompt.js";
import type { ProviderDetection, ProviderDetector, ProviderName, ProviderRequest } from "../providers/contract.js";
import { detectProvider } from "../providers/detect.js";
import { NodeProcessRunner } from "../providers/process.js";
import { routeProvider } from "../providers/route.js";
import type { CorpusAssets } from "../renderer/corpus.js";
import { writeCorpusDeck } from "../renderer/deck.js";
import type { ImageCalloutAsset } from "../renderer/image-callout.js";
import { DemoProviderNarrativeSchema, invokeProviderPlan } from "./provider-plan.js";

export class WorkflowOutputCollisionError extends Error {
	readonly code = "KCH-E-OUTPUT-002" as const;

	constructor(readonly outputPath: string) {
		super(`출력 파일이 이미 있습니다. 기존 파일을 보호하기 위해 중단했습니다: ${outputPath}`);
		this.name = "WorkflowOutputCollisionError";
	}
}

export function resolveWorkflowOfficeQaScriptPath(
	installRoot = process.env.KCH_INSTALL_ROOT,
	entrypoint = process.argv[1],
	cwd = process.cwd(),
): string {
	return installRoot === undefined
		? resolveOfficeQaScriptPath(entrypoint, cwd)
		: join(installRoot, "office-qa", "powerpoint.ps1");
}

export function resolveWorkflowAssetRoot(
	installRoot = process.env.KCH_INSTALL_ROOT,
	entrypoint = process.argv[1],
	cwd = process.cwd(),
): string {
	if (installRoot !== undefined) {
		return resolve(installRoot, "assets");
	}
	if (entrypoint !== undefined && basename(entrypoint).toLowerCase() === "kch-ppt.cjs") {
		const appDirectory = dirname(entrypoint);
		const distributionDirectory = dirname(appDirectory);
		return basename(distributionDirectory).toLowerCase() === "dist"
			? resolve(distributionDirectory, "..", "assets")
			: resolve(appDirectory, "..", "assets");
	}
	return resolve(cwd, "assets");
}

export interface DemoWorkflowRequest {
	readonly provider: ProviderRequest;
	readonly outputPath: string;
	readonly acceptClaudeSubscriptionUse: boolean;
	readonly officeQa: boolean;
}

export interface DemoWorkflowResult {
	readonly provider: ProviderName;
	readonly integrity: AtomicPptxResult["integrity"];
	readonly officeQa: OfficeQaResult;
	readonly imageStatus: "resolved" | "native-fallback";
	readonly provenancePath: string;
}

export interface WorkflowDependencies {
	readonly detect?: ProviderDetector;
	readonly invokeProvider?: (
		detection: ProviderDetection & { readonly state: "authenticated" },
		prompt: string,
	) => Promise<unknown>;
	readonly assetRoot?: string;
	readonly imageFileExists?: (path: string) => Promise<boolean>;
	readonly imageProviders?: Pick<ImagePipelineDependencies, "codexExtension" | "openAi" | "stock">;
	readonly officeQaRunner?: (pptxPath: string, evidenceDirectory: string) => Promise<OfficeQaResult>;
	readonly now?: () => Date;
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

export async function runDemoWorkflow(
	request: DemoWorkflowRequest,
	dependencies: WorkflowDependencies = {},
): Promise<DemoWorkflowResult> {
	const provenancePath = `${request.outputPath}.provenance.json`;
	if ((await exists(request.outputPath)) || (await exists(provenancePath))) {
		throw new WorkflowOutputCollisionError(request.outputPath);
	}
	const detector =
		dependencies.detect ?? ((provider: ProviderName) => detectProvider(provider, { runner: new NodeProcessRunner() }));
	let selected = await routeProvider(request.provider, detector);
	const prompt = `${buildPlannerPrompt()}\nInput brief:\n${JSON.stringify(DEMO_BRIEF)}`;
	const invoke = async (detection: typeof selected): Promise<unknown> =>
		dependencies.invokeProvider
			? dependencies.invokeProvider(detection, prompt)
			: invokeProviderPlan({
					provider: detection.provider,
					executable: detection.executable,
					prompt,
					acceptClaudeSubscriptionUse: request.acceptClaudeSubscriptionUse,
					localAppData: process.env.LOCALAPPDATA ?? process.env.HOME ?? ".",
					rerunCommand: process.argv.join(" "),
				});
	let providerOutput: unknown;
	try {
		providerOutput = await invoke(selected);
	} catch (error) {
		if (request.provider !== "auto" || selected.provider !== "codex") {
			throw error;
		}
		try {
			selected = await routeProvider("claude", detector);
		} catch {
			throw error;
		}
		providerOutput = await invoke(selected);
	}
	const slideSpec = planNarrative(DemoProviderNarrativeSchema.parse(providerOutput));

	const assetRoot = dependencies.assetRoot ?? resolveWorkflowAssetRoot();
	const logoPath = join(assetRoot, "logos", "KCH_LOGOV2.png");
	const panoramaPath = join(assetRoot, "panoramas", "shinan-wind-bottom.png");
	const image = await resolveImageAsset(
		{
			assetId: "kch-wordmark",
			slideId: "image-callout",
			alt: "KCH 그룹",
			purpose: "KCH 그룹 이미지 callout",
			aspectRatio: 458 / 246,
			supplied: {
				path: logoPath,
				pixelWidth: 458,
				pixelHeight: 246,
				identifier: "assets/logos/KCH_LOGOV2.png",
				licenseStatus: "internal-use-only",
			},
		},
		{
			fileExists:
				dependencies.imageFileExists ?? (process.env.KCH_FORCE_IMAGE_FAILURE === "1" ? async () => false : exists),
			...dependencies.imageProviders,
			now: () => (dependencies.now ?? (() => new Date()))().toISOString(),
		},
	);
	const panorama = await readFile(panoramaPath);
	let imageCallout: ImageCalloutAsset | undefined;
	if (image.status === "resolved") {
		imageCallout = {
			assetId: "shinan-wind-panorama",
			path: panoramaPath,
			pixelWidth: 4397,
			pixelHeight: 382,
			provenance: {
				source: "reference",
				identifier: "assets/panoramas/shinan-wind-bottom.png",
				licenseStatus: "internal-use-only",
			},
		};
	}
	const assets: CorpusAssets = {
		logoPath,
		brandLockupPath: logoPath,
		panoramaData: `image/png;base64,${panorama.toString("base64")}`,
		imageCallout,
	};
	const deck = await writeCorpusDeck({ targetPath: request.outputPath, assets });
	const evidenceDirectory = `${request.outputPath}.office-qa`;
	const officeQa = request.officeQa
		? await (
				dependencies.officeQaRunner ??
				((pptxPath, directory) =>
					runOfficeQa(
						{ pptxPath, evidenceDirectory: directory },
						{
							scriptPath: resolveWorkflowOfficeQaScriptPath(),
						},
					))
			)(request.outputPath, evidenceDirectory)
		: disabledOfficeQa(deck.integrity.sha256);
	await writeJsonExclusive(provenancePath, {
		provider: selected.provider,
		slideSpecCount: slideSpec.slides.length,
		imageStatus: image.status,
		imageAttempts: image.attempts,
		officeQaStatus: officeQa.status,
		pptxSha256: deck.integrity.sha256,
		createdAt: (dependencies.now ?? (() => new Date()))().toISOString(),
	});
	return {
		provider: selected.provider,
		integrity: deck.integrity,
		officeQa,
		imageStatus: image.status,
		provenancePath,
	};
}
