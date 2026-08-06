import type { ProcessRunner } from "../providers/contract.js";
import { nativeImageFallback } from "./fallback.js";
import { buildImagePrompt } from "./prompt.js";
import { buildImageProvenance } from "./provenance.js";
import { parseLicensedStockCandidate } from "./stock.js";
import { GeneratedImageSchema } from "./types.js";
import type {
	GeneratedImage,
	ImageAttempt,
	ImageGenerator,
	ImageRequest,
	ImageResolution,
	ResolvedImageAsset,
} from "./types.js";

export interface OpenAiImageProvider {
	readonly apiKey: string | undefined;
	readonly generate: ImageGenerator;
}

export interface ImagePipelineDependencies {
	readonly fileExists: (path: string) => Promise<boolean>;
	readonly codexExtension?: ImageGenerator;
	readonly openAi?: OpenAiImageProvider;
	readonly stock?: (prompt: string) => Promise<GeneratedImage | undefined>;
	readonly now?: () => string;
}

export type ImageFetch = (input: string, init: RequestInit) => Promise<Response>;

function detail(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resolvedAsset(
	request: ImageRequest,
	image: GeneratedImage,
	source: ResolvedImageAsset["provenance"]["source"],
	promptHash: string | null,
	createdAt: string,
	defaultLicense: string,
): ResolvedImageAsset {
	return {
		...image,
		assetId: request.assetId,
		alt: request.alt,
		provenance: buildImageProvenance({
			request,
			source,
			identifier: image.identifier,
			promptHash,
			licenseStatus: image.licenseStatus ?? defaultLicense,
			createdAt,
		}),
	};
}

export async function resolveImageAsset(
	request: ImageRequest,
	dependencies: ImagePipelineDependencies,
): Promise<ImageResolution> {
	if (!Number.isFinite(request.aspectRatio) || request.aspectRatio <= 0) {
		throw new RangeError("이미지 비율은 0보다 큰 유한수여야 합니다.");
	}
	const attempts: ImageAttempt[] = [];
	const createdAt = (dependencies.now ?? (() => new Date().toISOString()))();
	if (request.supplied && (await dependencies.fileExists(request.supplied.path))) {
		const image = GeneratedImageSchema.parse(request.supplied);
		attempts.push({ stage: "supplied", status: "resolved" });
		return {
			status: "resolved",
			asset: resolvedAsset(request, image, "provided", null, createdAt, request.supplied.licenseStatus),
			attempts,
		};
	}
	attempts.push({ stage: "supplied", status: "skipped" });
	const prompt = buildImagePrompt(request);

	if (dependencies.codexExtension) {
		try {
			const image = GeneratedImageSchema.parse(await dependencies.codexExtension(prompt.text));
			attempts.push({ stage: "codex-extension", status: "resolved" });
			return {
				status: "resolved",
				asset: resolvedAsset(request, image, "codex-extension", prompt.sha256, createdAt, "generated-internal-use"),
				attempts,
			};
		} catch (error) {
			attempts.push({ stage: "codex-extension", status: "failed", detail: detail(error) });
		}
	}

	const apiKey = dependencies.openAi?.apiKey?.trim();
	if (apiKey && dependencies.openAi) {
		try {
			const image = GeneratedImageSchema.parse(await dependencies.openAi.generate(prompt.text));
			attempts.push({ stage: "openai-api", status: "resolved" });
			return {
				status: "resolved",
				asset: resolvedAsset(request, image, "openai-api", prompt.sha256, createdAt, "generated-internal-use"),
				attempts,
			};
		} catch (error) {
			attempts.push({ stage: "openai-api", status: "failed", detail: detail(error) });
		}
	}

	if (dependencies.stock) {
		try {
			const candidate = await dependencies.stock(prompt.text);
			if (!candidate) {
				throw new Error("licensed stock candidate not found");
			}
			const image = parseLicensedStockCandidate(candidate);
			attempts.push({ stage: "stock", status: "resolved" });
			return {
				status: "resolved",
				asset: resolvedAsset(request, image, "stock", prompt.sha256, createdAt, image.licenseStatus ?? ""),
				attempts,
			};
		} catch (error) {
			attempts.push({ stage: "stock", status: "failed", detail: detail(error) });
		}
	}
	if (!dependencies.stock) {
		attempts.push({ stage: "stock", status: "failed", detail: "stock resolver unavailable" });
	}
	attempts.push({ stage: "native-fallback", status: "resolved" });
	return { status: "native-fallback", fallback: nativeImageFallback(request), attempts };
}

export async function requestOpenAiImage(
	prompt: string,
	apiKey: string,
	fetcher: ImageFetch = fetch,
): Promise<GeneratedImage> {
	if (!apiKey.trim()) {
		throw new Error("OpenAI Images API key is required.");
	}
	const response = await fetcher("https://api.openai.com/v1/images/generations", {
		method: "POST",
		headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
		body: JSON.stringify({ model: "gpt-image-1", prompt, size: "1536x1024", response_format: "b64_json" }),
	});
	if (!response.ok) {
		throw new Error(`OpenAI Images API failed: ${response.status}`);
	}
	const payload: unknown = await response.json();
	const parsed = payload as { readonly data?: readonly { readonly b64_json?: string }[] };
	const encoded = parsed.data?.[0]?.b64_json;
	if (!encoded) {
		throw new Error("OpenAI Images API returned no image.");
	}
	return {
		data: `image/png;base64,${encoded}`,
		pixelWidth: 1536,
		pixelHeight: 1024,
		identifier: "openai:gpt-image-1",
		licenseStatus: "generated-internal-use",
	};
}

export async function executeCodexImageExtension(input: {
	readonly executable: string;
	readonly args: readonly string[];
	readonly prompt: string;
	readonly runner: ProcessRunner;
	readonly timeoutMs: number;
}): Promise<GeneratedImage> {
	const result = await input.runner.run({
		command: input.executable,
		args: input.args,
		stdin: input.prompt,
		timeoutMs: input.timeoutMs,
	});
	if (result.timedOut || result.exitCode !== 0) {
		throw new Error("Codex image extension failed.");
	}
	let payload: unknown;
	try {
		payload = JSON.parse(result.stdout);
	} catch {
		throw new Error("Codex image extension returned invalid JSON.");
	}
	return GeneratedImageSchema.parse(payload);
}
