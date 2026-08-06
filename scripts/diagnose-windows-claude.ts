import { NodeProcessRunner } from "../src/providers/process.js";

import DEMO_BRIEF from "../examples/demo.json" with { type: "json" };
import { createClaudeJsonSchema } from "../src/cli/provider-plan.js";
import { buildPlannerPrompt } from "../src/planner/prompt.js";

async function main(): Promise<void> {
	const executable = process.argv[2];
	if (executable === undefined) {
		throw new Error("usage: diagnose-windows-claude <claude.cmd>");
	}

	const result = await new NodeProcessRunner().run({
		command: executable,
		args: ["-p", "--output-format", "json", "--json-schema", createClaudeJsonSchema()],
		stdin: `${buildPlannerPrompt()}\nInput brief:\n${JSON.stringify(DEMO_BRIEF)}`,
		timeoutMs: 600_000,
	});

	process.stdout.write(
		`${JSON.stringify({
			exitCode: result.exitCode,
			timedOut: result.timedOut,
			stderr: result.stderr,
			stdout: result.stdout,
		})}\n`,
	);
}

void main();
