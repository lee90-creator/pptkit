import { CommanderError } from "commander";

import { detectProvider } from "../providers/detect.js";
import { NodeProcessRunner } from "../providers/process.js";
import { parseCliArgs } from "./args.js";
import { formatCliError } from "./korean-errors.js";
import { runSpecWorkflow } from "./spec-workflow.js";
import type { SpecWorkflowRequest, SpecWorkflowResult } from "./spec-workflow.js";
import { runDemoWorkflow } from "./workflow.js";
import type { DemoWorkflowRequest, DemoWorkflowResult } from "./workflow.js";

export interface CliDependencies {
	readonly runDemo?: (request: DemoWorkflowRequest) => Promise<DemoWorkflowResult>;
	readonly runSpec?: (request: SpecWorkflowRequest) => Promise<SpecWorkflowResult>;
	readonly writeOut?: (line: string) => void;
	readonly writeError?: (line: string) => void;
}

export async function runCli(argv: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
	const args = parseCliArgs(argv);
	const writeOut = dependencies.writeOut ?? ((line: string) => process.stdout.write(line));
	if (args.mode === "diagnose") {
		const runner = new NodeProcessRunner();
		const detections = await Promise.all([detectProvider("codex", { runner }), detectProvider("claude", { runner })]);
		writeOut(`${JSON.stringify({ mode: "diagnose", providers: detections })}\n`);
		return 0;
	}
	if (args.mode === "generate") {
		const request: SpecWorkflowRequest = {
			specPath: args.specPath,
			outputPath: args.outputPath,
			officeQa: args.officeQa,
		};
		const result = await (dependencies.runSpec ?? runSpecWorkflow)(request);
		writeOut(
			`${JSON.stringify({
				status: "created",
				source: "conversation",
				output: args.outputPath,
				slides: result.slideCount,
				bytes: result.integrity.bytes,
				sha256: result.integrity.sha256,
				renderStatus: result.officeQa.status,
				provenance: result.provenancePath,
			})}\n`,
		);
		return 0;
	}
	const result = await (dependencies.runDemo ?? runDemoWorkflow)(args);
	writeOut(
		`${JSON.stringify({
			status: "created",
			provider: result.provider,
			output: args.outputPath,
			bytes: result.integrity.bytes,
			sha256: result.integrity.sha256,
			renderStatus: result.officeQa.status,
			provenance: result.provenancePath,
		})}\n`,
	);
	return 0;
}

export async function main(argv: readonly string[], dependencies: CliDependencies = {}): Promise<number> {
	try {
		return await runCli(argv, dependencies);
	} catch (error) {
		if (error instanceof CommanderError && error.exitCode === 0) {
			return 0;
		}
		const receipt = formatCliError(error);
		(dependencies.writeError ?? ((line: string) => process.stderr.write(line)))(
			`${JSON.stringify({ code: receipt.code, message: receipt.message })}\n`,
		);
		return receipt.exitCode;
	}
}
