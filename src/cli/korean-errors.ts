import { CommanderError } from "commander";
import { ZodError } from "zod";

export interface CliErrorReceipt {
	readonly code: string;
	readonly message: string;
	readonly exitCode: number;
}

export function formatCliError(error: unknown): CliErrorReceipt {
	if (error instanceof CommanderError || (error instanceof Error && error.name === "CliArgumentError")) {
		return {
			code: "KCH-E-CLI-001",
			message:
				error instanceof CommanderError ? "명령 인수를 확인하세요. --help로 사용법을 볼 수 있습니다." : error.message,
			exitCode: 2,
		};
	}
	if (error instanceof ZodError) {
		return {
			code: "KCH-E-SCHEMA-001",
			message: "AI 응답이 안전한 슬라이드 계약을 충족하지 않아 출력 생성을 중단했습니다.",
			exitCode: 11,
		};
	}
	if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("KCH-E-")) {
		return {
			code: error.code,
			message: error.message,
			exitCode: error.code === "KCH-E-PROVIDER-001" ? 10 : 12,
		};
	}
	return {
		code: "KCH-E-WORKFLOW-001",
		message: "작업을 완료하지 못했습니다. 입력 파일과 실행 환경을 확인하세요.",
		exitCode: 1,
	};
}
