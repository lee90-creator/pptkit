import { describe, expect, test } from "bun:test";
import type { ProcessRequest, ProcessResult, ProcessRunner, ProviderDetection } from "../../src/providers/contract.js";
import { detectProvider } from "../../src/providers/detect.js";
import { NodeProcessRunner } from "../../src/providers/process.js";
import { ProviderRoutingError, routeProvider } from "../../src/providers/route.js";

class FakeRunner implements ProcessRunner {
	readonly requests: ProcessRequest[] = [];

	constructor(private readonly results: ReadonlyMap<string, ProcessResult | Error>) {}

	async run(request: ProcessRequest): Promise<ProcessResult> {
		this.requests.push(request);
		const result = this.results.get(request.command);
		if (result instanceof Error) {
			throw result;
		}
		if (result === undefined) {
			throw new Error(`unexpected command: ${request.command}`);
		}
		return result;
	}
}

const ok = (stdout: string): ProcessResult => ({
	exitCode: 0,
	stdout,
	stderr: "",
	timedOut: false,
});

const failed = (stderr: string): ProcessResult => ({
	exitCode: 1,
	stdout: "",
	stderr,
	timedOut: false,
});

const detected = (provider: "codex" | "claude", state: ProviderDetection["state"]): ProviderDetection => ({
	provider,
	state,
	executable: provider,
});

describe("bounded process runner", () => {
	test("captures both streams and closes stdin", async () => {
		const runner = new NodeProcessRunner();
		const result = await runner.run({
			command: process.execPath,
			args: [
				"-e",
				"let input='';process.stdin.on('data',chunk=>input+=chunk);process.stdin.on('end',()=>{process.stdout.write(input+':closed');process.stderr.write('trace')})",
			],
			stdin: "prompt",
			timeoutMs: 2_000,
		});

		expect(result).toEqual({
			exitCode: 0,
			stdout: "prompt:closed",
			stderr: "trace",
			timedOut: false,
		});
	});

	test("terminates a process at the configured bound", async () => {
		const runner = new NodeProcessRunner();
		const result = await runner.run({
			command: process.execPath,
			args: ["-e", "setInterval(()=>{}, 1000)"],
			timeoutMs: 20,
		});

		expect(result.timedOut).toBe(true);
		expect(result.exitCode).not.toBe(0);
	});
});

describe("provider detection", () => {
	test.each([
		["codex", ok('{"authenticated":true}\n'), "authenticated", ["login", "status"]],
		["codex", failed("not logged in"), "installed-unauthenticated", ["login", "status"]],
		["claude", ok('{"authenticated":true}\n'), "authenticated", ["auth", "status", "--json"]],
		["claude", failed("login required"), "installed-unauthenticated", ["auth", "status", "--json"]],
	] as const)("%s maps its documented probe to $2", async (provider, result, state, expectedArgs) => {
		const runner = new FakeRunner(new Map([[provider, result]]));
		await expect(
			detectProvider(provider, {
				runner,
				findExecutable: async () => provider,
			}),
		).resolves.toMatchObject({ provider, state, executable: provider });
		expect(runner.requests).toEqual([
			{
				command: provider,
				args: expectedArgs,
				timeoutMs: 10_000,
			},
		]);
	});

	test.each(["codex", "claude"] as const)("%s reports a missing executable", async (provider) => {
		const runner = new FakeRunner(new Map());
		await expect(
			detectProvider(provider, {
				runner,
				findExecutable: async () => undefined,
			}),
		).resolves.toEqual({ provider, state: "missing" });
		expect(runner.requests).toHaveLength(0);
	});

	test.each(["codex", "claude"] as const)("%s reports an unusable executable", async (provider) => {
		const runner = new FakeRunner(new Map([[provider, new Error("EACCES")]]));
		await expect(
			detectProvider(provider, {
				runner,
				findExecutable: async () => provider,
			}),
		).resolves.toMatchObject({ provider, state: "unusable", executable: provider });
	});
});

describe("provider routing", () => {
	test.each([
		["codex", "codex"],
		["claude", "claude"],
	] as const)("explicit %s selects only itself", async (requested, selected) => {
		const calls: string[] = [];
		const result = await routeProvider(requested, async (provider) => {
			calls.push(provider);
			return detected(provider, "authenticated");
		});
		expect(result.provider).toBe(selected);
		expect(calls).toEqual([requested]);
	});

	test("auto deterministically prefers authenticated Codex", async () => {
		const calls: string[] = [];
		const result = await routeProvider("auto", async (provider) => {
			calls.push(provider);
			return detected(provider, "authenticated");
		});
		expect(result.provider).toBe("codex");
		expect(calls).toEqual(["codex"]);
	});

	test("auto falls back to authenticated Claude", async () => {
		const calls: string[] = [];
		const result = await routeProvider("auto", async (provider) => {
			calls.push(provider);
			return detected(provider, provider === "codex" ? "installed-unauthenticated" : "authenticated");
		});
		expect(result.provider).toBe("claude");
		expect(calls).toEqual(["codex", "claude"]);
	});

	const unavailableStates = ["installed-unauthenticated", "missing", "unusable"] as const;

	for (const codexState of unavailableStates) {
		for (const claudeState of unavailableStates) {
			test(`auto rejects codex=${codexState}, claude=${claudeState} in Korean`, async () => {
				const calls: string[] = [];
				try {
					await routeProvider("auto", async (provider) => {
						calls.push(provider);
						return detected(provider, provider === "codex" ? codexState : claudeState);
					});
					throw new Error("expected provider routing to fail");
				} catch (error) {
					expect(error).toBeInstanceOf(ProviderRoutingError);
					expect((error as ProviderRoutingError).code).toBe("KCH-E-PROVIDER-001");
					expect((error as Error).message).toContain("인증");
					expect(calls).toEqual(["codex", "claude"]);
				}
			});
		}
	}

	for (const requested of ["codex", "claude"] as const) {
		for (const state of unavailableStates) {
			test(`explicit ${requested}=${state} fails without substitution`, async () => {
				const calls: string[] = [];
				await expect(
					routeProvider(requested, async (provider) => {
						calls.push(provider);
						return detected(provider, state);
					}),
				).rejects.toMatchObject({ code: "KCH-E-PROVIDER-001" });
				expect(calls).toEqual([requested]);
			});
		}
	}
});
