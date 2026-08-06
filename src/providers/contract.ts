import type { z } from "zod";

import type { ProviderNameSchema, ProviderStatusSchema } from "../schema/provider.js";

export type ProviderName = z.infer<typeof ProviderNameSchema>;
export type ProviderRequest = ProviderName | "auto";
export type ProviderState = z.infer<typeof ProviderStatusSchema>;

export type ProviderDetection =
	| {
			readonly provider: ProviderName;
			readonly state: "missing";
	  }
	| {
			readonly provider: ProviderName;
			readonly state: Exclude<ProviderState, "missing">;
			readonly executable: string;
			readonly detail?: string;
	  };

export interface ProcessRequest {
	readonly command: string;
	readonly args: readonly string[];
	readonly timeoutMs: number;
	readonly stdin?: string;
	readonly cwd?: string;
	readonly env?: Readonly<Record<string, string>>;
}

export interface ProcessResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly timedOut: boolean;
}

export interface ProcessRunner {
	run(request: ProcessRequest): Promise<ProcessResult>;
}

export type FindExecutable = (command: string) => Promise<string | undefined>;

export interface DetectProviderDependencies {
	readonly runner: ProcessRunner;
	readonly findExecutable?: FindExecutable;
}

export type ProviderDetector = (provider: ProviderName) => Promise<ProviderDetection>;
