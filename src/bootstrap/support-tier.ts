import type { BootstrapStepResult } from "../schema/bootstrap.js";
import { BOOTSTRAP_STEP_IDS, type BootstrapEnvironment, BootstrapEnvironmentSchema, RISK_CODES } from "./contract.js";

export interface BlockedReceipt {
	readonly policy: string;
	readonly path: string;
	readonly sha256: string;
	readonly itAction: string;
}

export type SupportClassification =
	| { readonly tier: "A"; readonly risks: readonly [] }
	| { readonly tier: "B"; readonly risks: readonly ("network" | "office" | "font-policy")[] }
	| { readonly tier: "C"; readonly risks: readonly ("R-PS" | "R-STOP")[]; readonly receipt: BlockedReceipt };

function parseEnvironment(input: unknown): BootstrapEnvironment {
	return BootstrapEnvironmentSchema.parse(input);
}

export function classifySupportTier(input: unknown): SupportClassification {
	const environment = parseEnvironment(input);
	if (
		!environment.batAllowed ||
		!environment.powershellAllowed ||
		!environment.userScopeWrite ||
		!environment.payloadExecutionAllowed
	) {
		if (environment.blocked === undefined) {
			throw new Error("차단 환경에는 정책, 경로, SHA-256 정보가 필요합니다.");
		}
		return {
			tier: "C",
			risks: environment.powershellAllowed ? ["R-STOP"] : RISK_CODES,
			receipt: {
				...environment.blocked,
				itAction: `IT 담당자에게 ${environment.blocked.policy} 정책에서 해당 경로와 SHA-256 실행 허용을 요청하세요.`,
			},
		};
	}
	const risks: Array<"network" | "office" | "font-policy"> = [];
	if (!environment.networkAvailable) {
		risks.push("network");
	}
	if (!environment.officeAvailable) {
		risks.push("office");
	}
	if (!environment.fontInstallAllowed) {
		risks.push("font-policy");
	}
	return risks.length === 0 ? { tier: "A", risks: [] } : { tier: "B", risks };
}

export function buildBootstrapPlan(input: unknown): readonly BootstrapStepResult[] {
	const environment = parseEnvironment(input);
	const classification = classifySupportTier(environment);
	if (classification.tier === "C") {
		return [
			{
				id: "policy-stop",
				state: "BLOCKED",
				supportTier: "C",
				message: `${classification.receipt.policy} 정책으로 실행이 차단되었습니다.`,
				path: classification.receipt.path,
				sha256: classification.receipt.sha256,
				itAction: classification.receipt.itAction,
			},
		];
	}
	return BOOTSTRAP_STEP_IDS.map((id) => {
		const warning =
			classification.tier === "B" &&
			((id === "fonts-pretendard" && !environment.fontInstallAllowed) ||
				(id === "office-qa" && !environment.officeAvailable));
		return {
			id,
			state: warning ? "WARN" : "CHECK",
			supportTier: classification.tier,
			message: warning ? "정책 제한으로 저하된 검증 경로를 사용합니다." : "구성요소 상태를 확인합니다.",
		};
	});
}
