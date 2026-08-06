import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { canRunWslWindowsTests } from "../support/windows-environment.js";

const roots: string[] = [];
const SCRIPT = resolve("setup/bootstrap.ps1");

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

async function put(path: string, content: string): Promise<void> {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content);
}

async function fixture(): Promise<{ readonly root: string; readonly distribution: string; readonly install: string }> {
	const root = await mkdtemp(join(tmpdir(), "kch-bootstrap-"));
	roots.push(root);
	const distribution = join(root, "distribution");
	const install = join(root, "install");
	const files = new Map([
		["dist/runtime/node/node.exe", "node"],
		["dist/app/kch-ppt.cjs", "app"],
		["dist/office-qa/powerpoint.ps1", "office"],
		["dist/tools/claude/bin/claude.cmd", "claude"],
		["dist/tools/codex/bin/codex.cmd", "codex"],
		["assets/fonts/Pretendard-Regular.ttf", "regular"],
		["assets/fonts/Pretendard-Bold.ttf", "bold"],
		["assets/fonts/Pretendard-Black.ttf", "black"],
		["plugins/claude-code/skills/kchppt/SKILL.md", "claude-kchppt"],
		["plugins/codex/skills/kchppt/SKILL.md", "codex-kchppt"],
	]);
	for (const [path, content] of files) {
		await put(join(distribution, path), content);
	}
	const inventory = await Promise.all(
		[...files.keys()].map(async (path) => ({ path, sha256: sha256(await readFile(join(distribution, path))) })),
	);
	await put(
		join(distribution, "dist/manifest.json"),
		JSON.stringify({
			schemaVersion: 1,
			lockSha256: "a".repeat(64),
			sourceSha256: "c".repeat(64),
			files: inventory,
			runtime: { source: "dist/runtime/node", target: "runtime/node" },
			application: { source: "dist/app/kch-ppt.cjs", target: "app/kch-ppt.cjs" },
			fonts: { scope: "user", source: "assets/fonts" },
			tools: {
				claude: { rootPackage: "dist/tools/claude", platformPackage: "dist/tools/claude", launcher: "bin/claude.cmd" },
				codex: { rootPackage: "dist/tools/codex", platformPackage: "dist/tools/codex", launcher: "bin/codex.cmd" },
			},
		}),
	);
	return { root, distribution, install };
}

function windowsPath(path: string): string {
	const result = Bun.spawnSync(["wslpath", "-w", path]);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.toString());
	}
	return result.stdout.toString().trim();
}

async function runBootstrap(
	distribution: string,
	install: string,
	extraEnv: Readonly<Record<string, string>> = {},
): Promise<{ readonly exitCode: number; readonly states: readonly string[]; readonly stdout: string }> {
	const variables = {
		KCH_DISTRIBUTION_ROOT: windowsPath(distribution),
		KCH_INSTALL_ROOT: windowsPath(install),
		KCH_CLAUDE_SKILLS_ROOT: windowsPath(join(dirname(install), "claude-skills")),
		KCH_CODEX_SKILLS_ROOT: windowsPath(join(dirname(install), "codex-skills")),
		KCH_SKIP_FONT_REGISTRATION: "1",
		...extraEnv,
	};
	const assignments = Object.entries(variables)
		.map(([key, value]) => `$env:${key}='${value.replaceAll("'", "''")}'`)
		.join("; ");
	const command = `${assignments}; & '${windowsPath(SCRIPT).replaceAll("'", "''")}' --bootstrap-diagnose; exit $LASTEXITCODE`;
	const encoded = Buffer.from(command, "utf16le").toString("base64");
	const process = Bun.spawn(
		[
			"powershell.exe",
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-ExecutionPolicy",
			"Bypass",
			"-EncodedCommand",
			encoded,
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	const [exitCode, stdoutBytes, stderrBytes] = await Promise.all([
		process.exited,
		new Response(process.stdout).arrayBuffer(),
		new Response(process.stderr).arrayBuffer(),
	]);
	const stdout = Buffer.from(stdoutBytes).toString("utf8");
	const stderr = Buffer.from(stderrBytes).toString("utf8");
	const states = stdout
		.split(/\r?\n/u)
		.filter((line) => line.trim().startsWith("{"))
		.map((line) => (JSON.parse(line) as { readonly state: string }).state);
	return { exitCode, states, stdout: `${stdout}${stderr}` };
}

async function snapshot(root: string): Promise<readonly string[]> {
	const output: string[] = [];
	async function visit(directory: string, prefix = ""): Promise<void> {
		for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
			a.name.localeCompare(b.name),
		)) {
			const child = prefix ? `${prefix}/${entry.name}` : entry.name;
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				await visit(path, child);
			} else {
				output.push(`${child}:${sha256(await readFile(path))}`);
			}
		}
	}
	await visit(root);
	return output;
}

describe.skipIf(!canRunWslWindowsTests())("idempotent Windows bootstrap", () => {
	test("forwards single-dash CLI aliases as literal script arguments", async () => {
		const script = await readFile(SCRIPT, "utf8");
		expect(script).toContain("$CliArguments = @($args)");
		expect(script).not.toContain("ValueFromRemainingArguments");
	});

	test("reserves bootstrap-only diagnostics without intercepting CLI diagnose", async () => {
		const script = await readFile(SCRIPT, "utf8");
		expect(script).toContain('$BootstrapDiagnose = $CliArguments -contains "--bootstrap-diagnose"');
		expect(script).not.toContain('$CliArguments -contains "--diagnose"');
		expect(script).not.toContain('$CliArguments -notcontains "--diagnose"');
	});

	test("installs an offline staged fixture then makes the second run all SKIP with zero writes", async () => {
		const { distribution, install } = await fixture();
		const first = await runBootstrap(distribution, install);
		expect(first.exitCode).toBe(0);
		expect(first.states).toContain("INSTALL");
		expect(await readFile(join(dirname(install), "claude-skills/kchppt/SKILL.md"), "utf8")).toBe("claude-kchppt");
		expect(await readFile(join(dirname(install), "codex-skills/kchppt/SKILL.md"), "utf8")).toBe("codex-kchppt");
		const before = await snapshot(install);
		const second = await runBootstrap(distribution, install);
		expect(second.exitCode).toBe(0);
		expect(second.states.length).toBeGreaterThan(0);
		expect(second.states.every((state) => state === "SKIP")).toBe(true);
		expect(await snapshot(install)).toEqual(before);
	}, 60_000);

	test("refreshes provider tools when distribution source changes", async () => {
		const { distribution, install } = await fixture();
		expect((await runBootstrap(distribution, install)).exitCode).toBe(0);

		const launcherPath = join(distribution, "dist/tools/claude/bin/claude.cmd");
		await writeFile(launcherPath, "claude-native");
		const manifestPath = join(distribution, "dist/manifest.json");
		const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
			sourceSha256: string;
			files: Array<{ path: string; sha256: string }>;
		};
		manifest.sourceSha256 = "d".repeat(64);
		const launcher = manifest.files.find((file) => file.path === "dist/tools/claude/bin/claude.cmd");
		if (launcher === undefined) {
			throw new Error("missing Claude launcher fixture");
		}
		launcher.sha256 = sha256(await readFile(launcherPath));
		await writeFile(manifestPath, JSON.stringify(manifest));

		const refreshed = await runBootstrap(distribution, install);
		expect(refreshed.exitCode).toBe(0);
		expect(await readFile(join(install, "tools/claude/bin/claude.cmd"), "utf8")).toBe("claude-native");
		expect((await runBootstrap(distribution, install)).states.every((state) => state === "SKIP")).toBe(true);
	}, 60_000);

	test("reports a missing staged payload with path hash and Korean IT action", async () => {
		const { distribution, install } = await fixture();
		await unlink(join(distribution, "dist/runtime/node/node.exe"));
		const result = await runBootstrap(distribution, install);
		expect(result.exitCode).not.toBe(0);
		expect(result.states).toContain("BLOCKED");
		expect(result.stdout).toContain("sha256");
		expect(result.stdout).toMatch(/[가-힣]/u);
	}, 30_000);

	test("stops at a simulated AppLocker boundary without writing install files", async () => {
		const { distribution, install } = await fixture();
		const result = await runBootstrap(distribution, install, {
			KCH_SIMULATE_BLOCKED_POLICY: "AppLocker",
			KCH_SIMULATE_BLOCKED_PATH: windowsPath(join(distribution, "dist/runtime/node/node.exe")),
			KCH_SIMULATE_BLOCKED_SHA256: "b".repeat(64),
		});
		expect(result.exitCode).not.toBe(0);
		expect(result.states).toEqual(["BLOCKED"]);
		expect(result.stdout).toContain("AppLocker");
		expect(await readdir(install).catch(() => [])).toEqual([]);
	}, 30_000);

	test("blocks instead of silently skipping a corrupted installed file", async () => {
		const { distribution, install } = await fixture();
		expect((await runBootstrap(distribution, install)).exitCode).toBe(0);
		await writeFile(join(install, "app/kch-ppt.cjs"), "corrupt");
		const result = await runBootstrap(distribution, install);
		expect(result.exitCode).not.toBe(0);
		expect(result.states).toEqual(["BLOCKED"]);
		expect(await readFile(join(install, "app/kch-ppt.cjs"), "utf8")).toBe("corrupt");
	}, 60_000);
});
