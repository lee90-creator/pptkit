import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export type MatrixRowName = "claude-only" | "codex-only" | "both" | "neither" | "malformed" | "image-failure";

export interface ProviderMatrixOptions {
	readonly installRoot: string;
	readonly fakeRoot: string;
	readonly evidenceRoot: string;
}

export interface ProviderMatrixRowResult {
	readonly name: MatrixRowName;
	readonly status: "PASS";
	readonly exitCode: number;
	readonly selectedProvider?: "codex" | "claude";
	readonly imageStatus?: "resolved" | "native-fallback";
	readonly targetCreated: boolean;
	readonly invocationCount: number;
}

export interface ProviderMatrixResult {
	readonly rows: readonly ProviderMatrixRowResult[];
}

interface MatrixExpectation {
	readonly name: MatrixRowName;
	readonly exitCode: number;
	readonly provider?: "codex" | "claude";
	readonly imageStatus?: "resolved" | "native-fallback";
	readonly invocations: number;
}

const EXPECTATIONS: readonly MatrixExpectation[] = [
	{ name: "claude-only", exitCode: 0, provider: "claude", imageStatus: "resolved", invocations: 3 },
	{ name: "codex-only", exitCode: 0, provider: "codex", imageStatus: "resolved", invocations: 2 },
	{ name: "both", exitCode: 0, provider: "codex", imageStatus: "resolved", invocations: 2 },
	{ name: "neither", exitCode: 10, invocations: 2 },
	{ name: "malformed", exitCode: 12, invocations: 2 },
	{ name: "image-failure", exitCode: 0, provider: "codex", imageStatus: "native-fallback", invocations: 2 },
];

function windowsPath(path: string): string {
	const result = Bun.spawnSync(["wslpath", "-w", path]);
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

async function runRow(
	expectation: MatrixExpectation,
	options: ProviderMatrixOptions,
): Promise<ProviderMatrixRowResult> {
	const rowRoot = join(options.evidenceRoot, expectation.name);
	await mkdir(rowRoot, { recursive: true });
	const output = join(rowRoot, "output.pptx");
	const log = join(rowRoot, "invocations.log");
	const node = join(options.installRoot, "runtime", "node", "node.exe");
	const app = join(options.installRoot, "app", "kch-ppt.cjs");
	const localAppData = join(rowRoot, "localappdata");
	const command = [
		`set PATH=${windowsPath(options.fakeRoot)};${windowsPath(join(options.installRoot, "runtime", "node"))};%PATH%`,
		`set KCH_MATRIX_NODE=${windowsPath(node)}`,
		`set KCH_FAKE_SCENARIO=${expectation.name}`,
		`set KCH_FAKE_LOG=${windowsPath(log)}`,
		`set KCH_INSTALL_ROOT=${windowsPath(options.installRoot)}`,
		`set LOCALAPPDATA=${windowsPath(localAppData)}`,
		`set KCH_FORCE_IMAGE_FAILURE=${expectation.name === "image-failure" ? "1" : "0"}`,
		`${windowsPath(node)} ${windowsPath(app)} --demo --provider auto --output ${windowsPath(output)} --no-office-qa --accept-claude-subscription-use`,
	].join("&& ");
	const child = Bun.spawn(["cmd.exe", "/d", "/s", "/c", command], { stdout: "pipe", stderr: "pipe" });
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	const invocations = (await readFile(log, "utf8")).trim().split(/\r?\n/u).filter(Boolean);
	const targetCreated = await Bun.file(output).exists();
	let provider: "codex" | "claude" | undefined;
	let imageStatus: "resolved" | "native-fallback" | undefined;
	if (targetCreated) {
		const receipt = JSON.parse(await readFile(`${output}.provenance.json`, "utf8")) as {
			provider: "codex" | "claude";
			imageStatus: "resolved" | "native-fallback";
		};
		provider = receipt.provider;
		imageStatus = receipt.imageStatus;
	}
	if (
		exitCode !== expectation.exitCode ||
		provider !== expectation.provider ||
		imageStatus !== expectation.imageStatus ||
		invocations.length !== expectation.invocations ||
		targetCreated !== (expectation.exitCode === 0)
	) {
		throw new Error(
			`${expectation.name} failed: ${JSON.stringify({ exitCode, provider, imageStatus, targetCreated, invocations, stdout, stderr })}`,
		);
	}
	return {
		name: expectation.name,
		status: "PASS",
		exitCode,
		...(provider ? { selectedProvider: provider } : {}),
		...(imageStatus ? { imageStatus } : {}),
		targetCreated,
		invocationCount: invocations.length,
	};
}

export async function runProviderMatrix(options: ProviderMatrixOptions): Promise<ProviderMatrixResult> {
	const rows: ProviderMatrixRowResult[] = [];
	for (const expectation of EXPECTATIONS) rows.push(await runRow(expectation, options));
	return { rows };
}

if (import.meta.main) {
	const evidenceIndex = process.argv.indexOf("--evidence");
	const evidenceRoot = evidenceIndex >= 0 ? process.argv[evidenceIndex + 1] : undefined;
	if (!evidenceRoot) throw new Error("usage: run-provider-matrix.ts --evidence <directory>");
	const result = await runProviderMatrix({
		installRoot: resolve(
			".omo/evidence/ulw/kch-ppt-automation-execution-20260803/G001-execute-the-complete-immutable-plan/a1/task-11-real-install",
		),
		fakeRoot: resolve("tests/fixtures/providers/windows"),
		evidenceRoot: resolve(evidenceRoot),
	});
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
