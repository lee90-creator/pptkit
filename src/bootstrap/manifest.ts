import { readFile } from "node:fs/promises";
import { z } from "zod";

const DependencySchema = z
	.object({
		package: z.string().min(1),
		resolvesPackage: z.string().min(1).optional(),
		version: z.string().min(1),
	})
	.strict();

const PayloadSchema = z
	.object({
		id: z.string().min(1),
		package: z.string().min(1),
		alias: z.string().min(1).optional(),
		version: z.string().min(1),
		url: z.url(),
		integrity: z.string().regex(/^sha(?:256|512)-[A-Za-z0-9+/=]+$/u),
		extractPath: z.string().min(1),
		dependencies: z.array(DependencySchema),
	})
	.strict();

const ToolsLockSchema = z
	.object({
		schemaVersion: z.literal(1),
		payloads: z.array(PayloadSchema).length(5),
	})
	.strict();

export type ToolsLock = z.infer<typeof ToolsLockSchema>;

const PackageMetadataSchema = z
	.object({
		name: z.string().min(1),
		version: z.string().min(1),
		dependencies: z.record(z.string(), z.string()),
		optionalDependencies: z.record(z.string(), z.string()),
	})
	.strict();

const PackageClosureSchema = z
	.object({
		claudeRoot: PackageMetadataSchema,
		claudePlatform: PackageMetadataSchema,
		codexRoot: PackageMetadataSchema,
		codexPlatform: PackageMetadataSchema,
	})
	.strict();

export type PackageClosure = z.infer<typeof PackageClosureSchema>;

const EXPECTED_PAYLOADS: ToolsLock["payloads"] = [
	{
		id: "node-win32-x64",
		package: "node",
		version: "22.22.2",
		url: "https://nodejs.org/dist/v22.22.2/node-v22.22.2-win-x64.zip",
		integrity: "sha256-7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c",
		extractPath: "dist/runtime/node-v22.22.2-win-x64",
		dependencies: [],
	},
	{
		id: "claude-code",
		package: "@anthropic-ai/claude-code",
		version: "2.1.220",
		url: "https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.220.tgz",
		integrity: "sha512-ogBrvwkqF9f8okmnXKxmRNHuvtFxFEffe5pWdqOV3iQDxlUOKirFqnyWC7NGXXnDA4WkkbPH8pvSbwyCR2Auyw==",
		extractPath: "dist/tools/claude/node_modules/@anthropic-ai/claude-code",
		dependencies: [{ package: "@anthropic-ai/claude-code-win32-x64", version: "2.1.220" }],
	},
	{
		id: "claude-code-win32-x64",
		package: "@anthropic-ai/claude-code-win32-x64",
		version: "2.1.220",
		url: "https://registry.npmjs.org/@anthropic-ai/claude-code-win32-x64/-/claude-code-win32-x64-2.1.220.tgz",
		integrity: "sha512-UGrjH8cGhC6PzhTyZSdgf/RpKxpfk9XJZ/RT/wsG2AJg9yEJLjLg6/TrnlL8RFbEv6Zahu0Quytc02UOpA/GiA==",
		extractPath: "dist/tools/claude/node_modules/@anthropic-ai/claude-code-win32-x64",
		dependencies: [],
	},
	{
		id: "codex",
		package: "@openai/codex",
		version: "0.145.0",
		url: "https://registry.npmjs.org/@openai/codex/-/codex-0.145.0.tgz",
		integrity: "sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==",
		extractPath: "dist/tools/codex/node_modules/@openai/codex",
		dependencies: [
			{
				package: "@openai/codex-win32-x64",
				resolvesPackage: "@openai/codex",
				version: "0.145.0-win32-x64",
			},
		],
	},
	{
		id: "codex-win32-x64",
		package: "@openai/codex",
		alias: "@openai/codex-win32-x64",
		version: "0.145.0-win32-x64",
		url: "https://registry.npmjs.org/@openai/codex/-/codex-0.145.0-win32-x64.tgz",
		integrity: "sha512-u0h9lk094CaXRSqE34SBW2dRaQTPa6fASXqehczWH9QdsU62mBsiAgAdp6tCG4i+YzPmmhjD8FdXNnYGNmwuMg==",
		extractPath: "dist/tools/codex/node_modules/@openai/codex-win32-x64",
		dependencies: [],
	},
];

const EXPECTED_PACKAGE_CLOSURE: PackageClosure = {
	claudeRoot: {
		name: "@anthropic-ai/claude-code",
		version: "2.1.220",
		dependencies: {},
		optionalDependencies: { "@anthropic-ai/claude-code-win32-x64": "2.1.220" },
	},
	claudePlatform: {
		name: "@anthropic-ai/claude-code-win32-x64",
		version: "2.1.220",
		dependencies: {},
		optionalDependencies: {},
	},
	codexRoot: {
		name: "@openai/codex",
		version: "0.145.0",
		dependencies: {},
		optionalDependencies: {
			"@openai/codex-win32-x64": "npm:@openai/codex@0.145.0-win32-x64",
		},
	},
	codexPlatform: {
		name: "@openai/codex",
		version: "0.145.0-win32-x64",
		dependencies: {},
		optionalDependencies: {},
	},
};

export class PayloadLockError extends Error {
	readonly code = "KCH-E-BOOTSTRAP-001" as const;

	constructor() {
		super("오프라인 도구 잠금 파일이 승인된 Windows payload 계약과 일치하지 않습니다.");
		this.name = "PayloadLockError";
	}
}

export function validateToolsLock(input: unknown): ToolsLock {
	const parsed = ToolsLockSchema.safeParse(input);
	if (!parsed.success || JSON.stringify(parsed.data.payloads) !== JSON.stringify(EXPECTED_PAYLOADS)) {
		throw new PayloadLockError();
	}
	return parsed.data;
}

export function validatePackageClosure(lock: ToolsLock, input: unknown): PackageClosure {
	validateToolsLock(lock);
	const parsed = PackageClosureSchema.safeParse(input);
	if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(EXPECTED_PACKAGE_CLOSURE)) {
		throw new PayloadLockError();
	}
	return parsed.data;
}

export async function loadToolsLock(filePath: URL | string): Promise<ToolsLock> {
	const input: unknown = JSON.parse(await readFile(filePath, "utf8"));
	return validateToolsLock(input);
}
