import type { ProviderDetection, ProviderDetector, ProviderName, ProviderRequest } from "./contract.js";

export class ProviderRoutingError extends Error {
	readonly code = "KCH-E-PROVIDER-001" as const;

	constructor(
		readonly requested: ProviderRequest,
		readonly detections: readonly ProviderDetection[],
	) {
		const states = detections.map(({ provider, state }) => `${provider}=${state}`).join(", ");
		super(
			`사용 가능한 인증 AI CLI를 찾지 못했습니다 (${states}). Claude 또는 Codex CLI에서 로그인한 뒤 다시 실행하세요.`,
		);
		this.name = "ProviderRoutingError";
	}
}

function authenticated(detection: ProviderDetection): detection is ProviderDetection & {
	readonly provider: ProviderName;
	readonly state: "authenticated";
	readonly executable: string;
} {
	return detection.state === "authenticated";
}

export async function routeProvider(
	requested: ProviderRequest,
	detect: ProviderDetector,
): Promise<ProviderDetection & { readonly state: "authenticated"; readonly executable: string }> {
	if (requested !== "auto") {
		const detection = await detect(requested);
		if (authenticated(detection)) {
			return detection;
		}
		throw new ProviderRoutingError(requested, [detection]);
	}

	const codex = await detect("codex");
	if (authenticated(codex)) {
		return codex;
	}
	const claude = await detect("claude");
	if (authenticated(claude)) {
		return claude;
	}
	throw new ProviderRoutingError(requested, [codex, claude]);
}
