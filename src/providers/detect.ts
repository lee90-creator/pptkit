import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";

import type { DetectProviderDependencies, FindExecutable, ProviderDetection, ProviderName } from "./contract.js";

const PROBES: Readonly<Record<ProviderName, { readonly command: string; readonly args: readonly string[] }>> = {
	codex: { command: "codex", args: ["login", "status"] },
	claude: { command: "claude", args: ["auth", "status", "--json"] },
};

async function isExecutable(candidate: string): Promise<boolean> {
	try {
		await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
		return true;
	} catch {
		return false;
	}
}

export const findExecutableOnPath: FindExecutable = async (command) => {
	const pathValue = process.env.PATH;
	if (pathValue === undefined) {
		return undefined;
	}
	const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
	for (const directory of pathValue.split(path.delimiter)) {
		for (const extension of extensions) {
			const candidate = path.join(directory, `${command}${extension.toLowerCase()}`);
			if (await isExecutable(candidate)) {
				return candidate;
			}
		}
	}
	return undefined;
};

export async function detectProvider(
	provider: ProviderName,
	dependencies: DetectProviderDependencies,
): Promise<ProviderDetection> {
	const probe = PROBES[provider];
	const executable = await (dependencies.findExecutable ?? findExecutableOnPath)(probe.command);
	if (executable === undefined) {
		return { provider, state: "missing" };
	}

	try {
		const result = await dependencies.runner.run({
			command: executable,
			args: probe.args,
			timeoutMs: 10_000,
		});
		if (result.timedOut) {
			return {
				provider,
				state: "unusable",
				executable,
				detail: "status probe timed out",
			};
		}
		if (result.exitCode === 0) {
			return { provider, state: "authenticated", executable };
		}
		return {
			provider,
			state: "installed-unauthenticated",
			executable,
			detail: result.stderr.trim() || result.stdout.trim(),
		};
	} catch (error) {
		return {
			provider,
			state: "unusable",
			executable,
			detail: error instanceof Error ? error.message : String(error),
		};
	}
}
