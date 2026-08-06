import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile as fsWriteFile, mkdir, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { gunzipSync } from "node:zlib";
import JSZip from "jszip";

import { type ToolsLock, loadToolsLock } from "../src/bootstrap/manifest.js";
import { verifiedDistributionReceipt, verifiedPayloadStage, walkDistribution } from "./bootstrap-receipt.js";
import { bootstrapSourceFingerprint } from "./bootstrap-source-fingerprint.js";

type DigestAlgorithm = "sha256" | "sha512";
type WriteData = string | Uint8Array;
type Write = (path: string, data: WriteData) => Promise<void>;
export interface BuildBootstrapOptions {
	readonly sourceRoot: string;
	readonly outputDir: string;
	readonly lockPath?: string;
	readonly fetch?: (url: string) => Promise<Response>;
	readonly writeFile?: Write;
	readonly payloadDigest?: (bytes: Uint8Array, algorithm: DigestAlgorithm) => Uint8Array;
	readonly report?: (line: string) => void;
}
export interface BootstrapBuildResult {
	readonly state: "INSTALL" | "SKIP";
	readonly downloads: number;
	readonly writes: number;
	readonly files: number;
}
export class BootstrapBuildError extends Error {
	readonly code = "KCH-E-BOOTSTRAP-001" as const;

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "BootstrapBuildError";
	}
}
const GENERATED_FILES = {
	"dist/run.bat": `@echo off\r\nsetlocal\r\nchcp 65001 >nul\r\nset "ROOT=%~dp0..\\"\r\npowershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "%ROOT%setup\\bootstrap.ps1" %*\r\nset "EXIT_CODE=%ERRORLEVEL%"\r\nif "%EXIT_CODE%"=="9009" echo {"id":"powershell","state":"BLOCKED","supportTier":"C","message":"Windows PowerShell을 실행할 수 없습니다.","path":"%SystemRoot%/System32/WindowsPowerShell/v1.0/powershell.exe","sha256":"0000000000000000000000000000000000000000000000000000000000000000","itAction":"IT 담당자에게 Windows PowerShell 실행 정책 확인을 요청하세요."}\r\nexit /b %EXIT_CODE%\r\n`,
	"dist/tools/claude/bin/claude.cmd": `@echo off\r\n"%~dp0..\\..\\..\\runtime\\node\\node.exe" "%~dp0..\\node_modules\\@anthropic-ai\\claude-code\\cli-wrapper.cjs" %*\r\n`,
	"dist/tools/codex/bin/codex.cmd": `@echo off\r\n"%~dp0..\\..\\..\\runtime\\node\\node.exe" "%~dp0..\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n`,
} as const;
const GENERATED_COPIES = [
	["dist/tools/claude/node_modules/@anthropic-ai/claude-code-win32-x64/claude.exe", "dist/tools/claude/bin/claude.exe"],
] as const;

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
function safeMember(name: string): string {
	const normalized = name.replaceAll("\\", "/").replace(/^\.\//u, "").replace(/\/+$/u, "");
	if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/u.test(normalized))
		throw new BootstrapBuildError(`unsafe archive member: ${name}`);
	const parts = normalized.split("/");
	if (parts.some((part) => part === ".." || part === "")) {
		throw new BootstrapBuildError(`unsafe archive member: ${name}`);
	}
	return parts.filter((part) => part !== ".").join("/");
}
function inside(root: string, member: string): string {
	const target = resolve(root, member);
	if (target !== resolve(root) && !target.startsWith(`${resolve(root)}${sep}`)) {
		throw new BootstrapBuildError(`archive member escapes destination: ${member}`);
	}
	return target;
}
function stripRoot(name: string, root: string): string {
	const safe = safeMember(name);
	return safe.startsWith(`${root}/`) ? safe.slice(root.length + 1) : safe;
}
async function zipFiles(bytes: Uint8Array, root: string): Promise<Array<[string, Uint8Array]>> {
	const zip = await JSZip.loadAsync(bytes);
	const files: Array<[string, Uint8Array]> = [];
	for (const entry of Object.values(zip.files)) {
		const original = entry.unsafeOriginalName ?? entry.name;
		safeMember(original);
		if (entry.dir) continue;
		if (typeof entry.unixPermissions === "number" && (entry.unixPermissions & 0o170000) === 0o120000) {
			throw new BootstrapBuildError(`archive link is forbidden: ${original}`);
		}
		const name = stripRoot(original, root);
		if (!name) continue;
		files.push([name, await entry.async("uint8array")]);
	}
	return files;
}
function octal(bytes: Uint8Array, start: number, length: number): number {
	const value = Buffer.from(bytes.subarray(start, start + length))
		.toString("ascii")
		.replaceAll("\0", "")
		.trim();
	const parsed = Number.parseInt(value || "0", 8);
	if (!Number.isFinite(parsed)) throw new BootstrapBuildError("invalid tar header");
	return parsed;
}
function tarFiles(compressed: Uint8Array): Array<[string, Uint8Array]> {
	const bytes = gunzipSync(compressed);
	const files: Array<[string, Uint8Array]> = [];
	for (let offset = 0; offset + 512 <= bytes.length; ) {
		const header = bytes.subarray(offset, offset + 512);
		if (header.every((byte) => byte === 0)) break;
		const name = Buffer.from(header.subarray(0, 100)).toString("utf8").replace(/\0.*$/u, "");
		const prefix = Buffer.from(header.subarray(345, 500)).toString("utf8").replace(/\0.*$/u, "");
		const fullName = prefix ? `${prefix}/${name}` : name;
		const size = octal(header, 124, 12);
		const type = String.fromCharCode(header[156] ?? 0);
		const bodyStart = offset + 512;
		const bodyEnd = bodyStart + size;
		if (bodyEnd > bytes.length) throw new BootstrapBuildError(`truncated tar member: ${fullName}`);
		safeMember(fullName);
		if (type === "0" || type === "\0") {
			const stripped = stripRoot(fullName, "package");
			if (stripped) files.push([stripped, bytes.subarray(bodyStart, bodyEnd)]);
		} else if (type !== "5") {
			throw new BootstrapBuildError(`tar links and special entries are forbidden: ${fullName}`);
		}
		offset = bodyStart + Math.ceil(size / 512) * 512;
	}
	return files;
}
function verifyPayload(
	bytes: Uint8Array,
	integrity: string,
	digest: (bytes: Uint8Array, algorithm: DigestAlgorithm) => Uint8Array,
): boolean {
	const separator = integrity.indexOf("-");
	const algorithm = integrity.slice(0, separator) as DigestAlgorithm;
	if (algorithm !== "sha256" && algorithm !== "sha512") return false;
	const encoded = integrity.slice(separator + 1);
	const expected = algorithm === "sha256" ? Buffer.from(encoded, "hex") : Buffer.from(encoded, "base64");
	return Buffer.from(digest(bytes, algorithm)).equals(expected);
}
async function sourceFiles(source: string): Promise<Array<[string, string]>> {
	const mappings: Array<[string, string]> = [
		["tools-lock.json", "tools-lock.json"],
		["dist/app/kch-ppt.cjs", "dist/app/kch-ppt.cjs"],
		["src/office-qa/powerpoint.ps1", "dist/office-qa/powerpoint.ps1"],
	];
	for (const directory of ["assets", "setup", "plugins"]) {
		for (const file of await walkDistribution(join(source, directory)))
			mappings.push([`${directory}/${file}`, `${directory}/${file}`]);
	}
	return mappings;
}
export async function buildBootstrapDistribution(options: BuildBootstrapOptions): Promise<BootstrapBuildResult> {
	const source = resolve(options.sourceRoot);
	const output = resolve(options.outputDir);
	const lockPath = options.lockPath ?? join(source, "tools-lock.json");
	const write: Write = options.writeFile ?? (async (path, data) => fsWriteFile(path, data));
	const fetcher = options.fetch ?? ((url: string) => fetch(url, { signal: AbortSignal.timeout(120_000) }));
	const digest = options.payloadDigest ?? ((bytes, algorithm) => createHash(algorithm).update(bytes).digest());
	let writes = 0;
	let downloads = 0;
	const put = async (path: string, data: WriteData): Promise<void> => {
		await mkdir(dirname(path), { recursive: true });
		await write(path, data);
		writes += 1;
	};
	try {
		const lock: ToolsLock = await loadToolsLock(lockPath);
		const lockBytes = await readFile(lockPath);
		const lockSha = sha256(lockBytes);
		const mappings = await sourceFiles(source);
		const generatedFingerprint = {
			...GENERATED_FILES,
			...Object.fromEntries(GENERATED_COPIES.map(([from, to]) => [to, `copy:${from}`])),
		};
		const sourceSha = await bootstrapSourceFingerprint(source, mappings, generatedFingerprint);
		const prior = await verifiedDistributionReceipt(output, lockSha, sourceSha);
		if (prior) {
			options.report?.("SKIP verified offline distribution");
			return { state: "SKIP", downloads: 0, writes: 0, files: prior.files.length };
		}
		await mkdir(output, { recursive: true });
		const reusePayloads = await verifiedPayloadStage(output, lockSha);
		for (const payload of reusePayloads ? [] : lock.payloads) {
			const extension = payload.url.endsWith(".zip") ? "zip" : "tgz";
			const cached = join(output, ".payloads", `${payload.id}.${extension}`);
			let bytes: Uint8Array;
			if (existsSync(cached)) {
				bytes = await readFile(cached);
				if (!verifyPayload(bytes, payload.integrity, digest)) {
					await rm(cached, { force: true });
					throw new BootstrapBuildError(`corrupt pinned payload deleted: ${payload.id}`);
				}
			} else {
				options.report?.(`CHECK download ${payload.id}`);
				const response = await fetcher(payload.url);
				downloads += 1;
				if (!response.ok) throw new BootstrapBuildError(`payload download failed (${response.status}): ${payload.id}`);
				bytes = new Uint8Array(await response.arrayBuffer());
				if (!verifyPayload(bytes, payload.integrity, digest))
					throw new BootstrapBuildError(`payload hash mismatch: ${payload.id}`);
				await put(cached, bytes);
			}
			const destination = join(output, payload.extractPath);
			options.report?.(`CHECK extract ${payload.id}`);
			const members = extension === "zip" ? await zipFiles(bytes, basename(payload.extractPath)) : tarFiles(bytes);
			for (const [name, data] of members) await put(inside(destination, name), data);
		}
		if (reusePayloads) options.report?.("SKIP verified payload stage");
		for (const [from, to] of mappings) await put(join(output, to), await readFile(join(source, from)));
		for (const [path, content] of Object.entries(GENERATED_FILES)) await put(join(output, path), content);
		for (const [from, to] of GENERATED_COPIES) await put(join(output, to), await readFile(join(output, from)));
		const template = JSON.parse(await readFile(join(source, "dist/manifest.template.json"), "utf8")) as Record<
			string,
			unknown
		>;
		const inventory = (await walkDistribution(output)).filter((path) => path !== "dist/manifest.json");
		const files = await Promise.all(
			inventory.map(async (path) => ({ path, sha256: sha256(await readFile(join(output, path))) })),
		);
		const receipt = { ...template, schemaVersion: 1, lockSha256: lockSha, sourceSha256: sourceSha, files };
		await put(join(output, "dist/manifest.json"), `${JSON.stringify(receipt, null, 2)}\n`);
		options.report?.(`INSTALL ${downloads} payloads, ${files.length + 1} files`);
		return { state: "INSTALL", downloads, writes, files: files.length + 1 };
	} catch (error) {
		if (error instanceof BootstrapBuildError) throw error;
		throw new BootstrapBuildError("failed to build pinned offline distribution", { cause: error });
	}
}
function cliArguments(args: readonly string[]): { sourceRoot: string; outputDir: string } {
	const argument = (flag: string): string | undefined => {
		const index = args.indexOf(flag);
		return index < 0 ? undefined : args[index + 1];
	};
	const outputDir = argument("--output");
	if (!outputDir)
		throw new BootstrapBuildError("usage: build-bootstrap.ts --output <directory> [--source-root <directory>]");
	return { sourceRoot: argument("--source-root") ?? process.cwd(), outputDir };
}
if (import.meta.main) {
	buildBootstrapDistribution({
		...cliArguments(process.argv.slice(2)),
		report: (line) => process.stdout.write(`${line}\n`),
	}).catch((error: unknown) => {
		process.stderr.write(`KCH-E-BOOTSTRAP-001 ${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	});
}
