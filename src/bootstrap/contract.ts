import { z } from "zod";

export const INSTALL_ROOT = "%LOCALAPPDATA%\\KCH\\PptAutomation" as const;
export const RISK_CODES = ["R-PS", "R-STOP"] as const;
export const BOOTSTRAP_STEP_IDS = [
	"distribution-manifest",
	"runtime-node",
	"application",
	"fonts-pretendard",
	"claude-cli",
	"codex-cli",
	"claude-kchppt",
	"codex-kchppt",
	"provider-auth",
	"office-qa",
] as const;

const BlockedCapabilitySchema = z
	.object({
		policy: z.string().min(1),
		path: z.string().min(1),
		sha256: z.string().regex(/^[a-f0-9]{64}$/u),
	})
	.strict();

export const BootstrapEnvironmentSchema = z
	.object({
		name: z.string().min(1),
		batAllowed: z.boolean(),
		powershellAllowed: z.boolean(),
		userScopeWrite: z.boolean(),
		payloadExecutionAllowed: z.boolean(),
		networkAvailable: z.boolean(),
		officeAvailable: z.boolean(),
		fontInstallAllowed: z.boolean(),
		blocked: BlockedCapabilitySchema.optional(),
	})
	.strict();

export type BootstrapEnvironment = z.infer<typeof BootstrapEnvironmentSchema>;
