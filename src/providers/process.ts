import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";

import type { ProcessRequest, ProcessResult, ProcessRunner } from "./contract.js";

const TIMED_OUT_EXIT_CODE = -1;
const CMD_META_CHARACTERS = /([()\][%!^"`<>&|;, *?])/gu;
const CMD_LINE_BREAKS = /[\0\r\n]/u;

export interface PreparedProcessCommand {
	readonly command: string;
	readonly args: readonly string[];
	readonly windowsVerbatimArguments: boolean;
}

function assertSingleCmdLine(value: string): void {
	if (CMD_LINE_BREAKS.test(value)) {
		throw new RangeError("Windows cmd arguments cannot contain NUL or line breaks");
	}
}

function escapeCmdCommand(value: string): string {
	assertSingleCmdLine(value);
	return value.replace(CMD_META_CHARACTERS, "^$1");
}

function escapeCmdArgument(value: string): string {
	assertSingleCmdLine(value);
	let escaped = value.replace(/(?=(\\+?)?)\1"/gu, '$1$1\\"');
	escaped = escaped.replace(/(?=(\\+?)?)\1$/gu, "$1$1");
	escaped = `"${escaped}"`;
	escaped = escaped.replace(CMD_META_CHARACTERS, "^$1");
	return escaped.replace(CMD_META_CHARACTERS, "^$1");
}

export function prepareProcessCommand(
	request: Pick<ProcessRequest, "command" | "args">,
	platform: NodeJS.Platform = process.platform,
	comSpec = process.env.ComSpec ?? "cmd.exe",
): PreparedProcessCommand {
	if (platform === "win32" && /\.(?:bat|cmd)$/iu.test(request.command)) {
		const invocation = [escapeCmdCommand(request.command), ...request.args.map(escapeCmdArgument)].join(" ");
		return { command: comSpec, args: ["/d", "/s", "/c", `"${invocation}"`], windowsVerbatimArguments: true };
	}
	return { command: request.command, args: request.args, windowsVerbatimArguments: false };
}

function killProcessTree(child: ChildProcessWithoutNullStreams): void {
	if (child.pid === undefined) {
		return;
	}
	if (process.platform === "win32") {
		const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
			stdio: "ignore",
			windowsHide: true,
		});
		killer.unref();
		return;
	}
	try {
		process.kill(-child.pid, "SIGKILL");
	} catch {
		child.kill("SIGKILL");
	}
}

export class NodeProcessRunner implements ProcessRunner {
	run(request: ProcessRequest): Promise<ProcessResult> {
		if (!Number.isSafeInteger(request.timeoutMs) || request.timeoutMs <= 0) {
			return Promise.reject(new RangeError("timeoutMs must be a positive integer"));
		}

		return new Promise((resolve, reject) => {
			const prepared = prepareProcessCommand(request);
			const child = spawn(prepared.command, [...prepared.args], {
				cwd: request.cwd,
				env: request.env === undefined ? process.env : { ...process.env, ...request.env },
				detached: process.platform !== "win32",
				stdio: ["pipe", "pipe", "pipe"],
				windowsVerbatimArguments: prepared.windowsVerbatimArguments,
				windowsHide: true,
			});
			let stdout = "";
			let stderr = "";
			let timedOut = false;
			let settled = false;

			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk: string) => {
				stderr += chunk;
			});

			const timer = setTimeout(() => {
				timedOut = true;
				killProcessTree(child);
			}, request.timeoutMs);

			child.once("error", (error) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				reject(error);
			});
			child.stdin.once("error", (error) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				killProcessTree(child);
				reject(error);
			});
			child.once("close", (code) => {
				if (settled) {
					return;
				}
				settled = true;
				clearTimeout(timer);
				resolve({
					exitCode: timedOut ? TIMED_OUT_EXIT_CODE : (code ?? TIMED_OUT_EXIT_CODE),
					stdout,
					stderr,
					timedOut,
				});
			});

			child.stdin.end(request.stdin);
		});
	}
}
