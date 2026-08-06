import { Command, Option } from "commander";

import PACKAGE from "../../package.json" with { type: "json" };
import type { ProviderRequest } from "../providers/contract.js";

export type CliArgs =
	| { readonly mode: "diagnose" }
	| {
			readonly mode: "generate";
			readonly specPath: string;
			readonly outputPath: string;
			readonly officeQa: boolean;
	  }
	| {
			readonly mode: "demo";
			readonly provider: ProviderRequest;
			readonly outputPath: string;
			readonly acceptClaudeSubscriptionUse: boolean;
			readonly officeQa: boolean;
	  };

export class CliArgumentError extends Error {
	readonly code = "KCH-E-CLI-001" as const;

	constructor(message: string) {
		super(message);
		this.name = "CliArgumentError";
	}
}

export function buildProgram(): Command {
	return new Command()
		.name("kch-ppt-automation")
		.description("KCH presentation automation CLI")
		.version(PACKAGE.version, "-v, --version", "버전을 표시합니다.")
		.argument("[command]", "실행 명령 (generate)")
		.option("--demo", "데모 프레젠테이션을 생성합니다.")
		.option("--diagnose", "app-local 구성요소를 진단합니다.")
		.option("--spec <path>", "대화에서 확정한 프레젠테이션 JSON 경로")
		.addOption(new Option("--provider <provider>", "AI provider").choices(["auto", "codex", "claude"]).default("auto"))
		.option("-o, --output <path>", "출력 PPTX 경로")
		.option("--accept-claude-subscription-use", "인증된 Claude 구독 재사용에 동의합니다.")
		.option("--no-office-qa", "PowerPoint COM 검증을 생략합니다.")
		.allowExcessArguments(false)
		.configureOutput({ writeErr: () => undefined })
		.exitOverride();
}

export function parseCliArgs(argv: readonly string[]): CliArgs {
	const program = buildProgram();
	program.parse([...argv], { from: "user" });
	const options = program.opts<{
		readonly demo?: boolean;
		readonly diagnose?: boolean;
		readonly spec?: string;
		readonly provider: ProviderRequest;
		readonly output?: string;
		readonly acceptClaudeSubscriptionUse?: boolean;
		readonly officeQa: boolean;
	}>();
	const command = program.args[0];
	if (command !== undefined && command !== "generate") {
		throw new CliArgumentError(`지원하지 않는 명령입니다: ${command}`);
	}
	if (command === "generate") {
		if (options.demo || options.diagnose) {
			throw new CliArgumentError("generate 명령은 --demo 또는 --diagnose와 함께 사용할 수 없습니다.");
		}
		if (!options.spec || !options.output) {
			throw new CliArgumentError("generate에는 --spec과 --output 경로가 필요합니다.");
		}
		return {
			mode: "generate",
			specPath: options.spec,
			outputPath: options.output,
			officeQa: options.officeQa,
		};
	}
	if (options.demo === options.diagnose) {
		throw new CliArgumentError("--demo 또는 --diagnose 중 하나만 지정하세요.");
	}
	if (options.diagnose) {
		return { mode: "diagnose" };
	}
	if (!options.output) {
		throw new CliArgumentError("--demo에는 --output 경로가 필요합니다.");
	}
	return {
		mode: "demo",
		provider: options.provider,
		outputPath: options.output,
		acceptClaudeSubscriptionUse: options.acceptClaudeSubscriptionUse === true,
		officeQa: options.officeQa,
	};
}
