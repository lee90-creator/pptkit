import { createHash, randomUUID } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import JSZip from "jszip";

interface ReleaseFile {
	readonly path: string;
	readonly sha256: string;
	readonly bytes: number;
}

interface LightweightManifest {
	readonly schemaVersion: 2;
	readonly profile: "lightweight";
	readonly sourceSha256: string;
	readonly requires: {
		readonly node: ">=20";
		readonly terminalAi: true;
	};
	readonly files: readonly ReleaseFile[];
}

export interface BuildLightweightReleaseOptions {
	readonly sourceRoot: string;
	readonly outputDir: string;
	readonly zipPath: string;
	readonly buildApp?: (outputPath: string) => Promise<void>;
	readonly report?: (line: string) => void;
}

export interface BuildLightweightReleaseResult {
	readonly state: "INSTALL" | "SKIP";
	readonly files: readonly string[];
	readonly bytes: number;
	readonly zipBytes: number;
}

export class LightweightReleaseError extends Error {
	readonly code = "KCH-E-RELEASE-001" as const;

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "LightweightReleaseError";
	}
}

function sha256(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function portable(path: string): string {
	return path.split(sep).join("/");
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function walk(root: string, directory = root): Promise<string[]> {
	const files: string[] = [];
	for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
		a.name.localeCompare(b.name),
	)) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await walk(root, path)));
		else if (entry.isFile()) files.push(portable(relative(root, path)));
	}
	return files;
}

async function sourceFingerprint(sourceRoot: string): Promise<string> {
	const hash = createHash("sha256");
	const candidates = [
		"src",
		"assets",
		"plugins",
		"setup/install.ps1",
		"setup/run.bat",
		"package.json",
		"bun.lock",
		"tsconfig.json",
	];
	const files: string[] = [];
	for (const candidate of candidates) {
		const path = join(sourceRoot, candidate);
		if (!(await exists(path))) continue;
		const info = await stat(path);
		if (info.isDirectory()) files.push(...(await walk(sourceRoot, path)));
		else files.push(portable(candidate));
	}
	for (const file of [...new Set(files)].sort()) {
		hash
			.update(file)
			.update("\0")
			.update(await readFile(join(sourceRoot, file)))
			.update("\0");
	}
	return hash.digest("hex");
}

async function verifiedRelease(
	outputDir: string,
	zipPath: string,
	sourceSha256: string,
): Promise<LightweightManifest | undefined> {
	try {
		const manifest = JSON.parse(await readFile(join(outputDir, "dist/manifest.json"), "utf8")) as LightweightManifest;
		if (
			manifest.schemaVersion !== 2 ||
			manifest.profile !== "lightweight" ||
			manifest.sourceSha256 !== sourceSha256 ||
			!(await exists(zipPath))
		) {
			return undefined;
		}
		for (const file of manifest.files) {
			const bytes = await readFile(join(outputDir, file.path));
			if (bytes.byteLength !== file.bytes || sha256(bytes) !== file.sha256) return undefined;
		}
		return manifest;
	} catch {
		return undefined;
	}
}

async function defaultBuildApp(sourceRoot: string, outputPath: string): Promise<void> {
	const result = await Bun.build({
		entrypoints: [join(sourceRoot, "src/index.ts")],
		outdir: dirname(outputPath),
		naming: "kch-ppt.cjs",
		target: "node",
		format: "cjs",
	});
	if (!result.success) {
		throw new LightweightReleaseError(`CLI 번들 생성에 실패했습니다: ${result.logs.join("\n")}`);
	}
}

async function copyDistributionSources(sourceRoot: string, staging: string): Promise<void> {
	for (const directory of ["assets", "plugins"]) {
		await cp(join(sourceRoot, directory), join(staging, directory), { recursive: true });
	}
	for (const [source, target] of [
		["setup/install.ps1", "setup/install.ps1"],
		["setup/run.bat", "setup/run.bat"],
		["src/office-qa/powerpoint.ps1", "dist/office-qa/powerpoint.ps1"],
	] as const) {
		await mkdir(dirname(join(staging, target)), { recursive: true });
		await cp(join(sourceRoot, source), join(staging, target));
	}
}

async function releaseFiles(root: string): Promise<ReleaseFile[]> {
	const paths = (await walk(root)).filter((path) => path !== "dist/manifest.json");
	return Promise.all(
		paths.map(async (path) => {
			const bytes = await readFile(join(root, path));
			return { path, sha256: sha256(bytes), bytes: bytes.byteLength };
		}),
	);
}

async function createZip(root: string): Promise<Uint8Array> {
	const archive = new JSZip();
	for (const path of await walk(root)) {
		archive.file(path, await readFile(join(root, path)));
	}
	return archive.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}

export async function buildLightweightRelease(
	options: BuildLightweightReleaseOptions,
): Promise<BuildLightweightReleaseResult> {
	const sourceRoot = resolve(options.sourceRoot);
	const outputDir = resolve(options.outputDir);
	const zipPath = resolve(options.zipPath);
	const sourceSha256 = await sourceFingerprint(sourceRoot);
	const verified = await verifiedRelease(outputDir, zipPath, sourceSha256);
	if (verified) {
		const zipBytes = (await stat(zipPath)).size;
		options.report?.(`SKIP ${verified.files.length + 1} files, ${zipBytes} zip bytes`);
		return {
			state: "SKIP",
			files: [...verified.files.map((file) => file.path), "dist/manifest.json"].sort(),
			bytes: verified.files.reduce((sum, file) => sum + file.bytes, 0),
			zipBytes,
		};
	}

	const staging = `${outputDir}.kch-stage-${randomUUID()}`;
	const temporaryZip = `${zipPath}.kch-tmp-${randomUUID()}`;
	try {
		await mkdir(join(staging, "dist/app"), { recursive: true });
		await copyDistributionSources(sourceRoot, staging);
		await (options.buildApp ?? ((path) => defaultBuildApp(sourceRoot, path)))(join(staging, "dist/app/kch-ppt.cjs"));
		const files = await releaseFiles(staging);
		const manifest: LightweightManifest = {
			schemaVersion: 2,
			profile: "lightweight",
			sourceSha256,
			requires: { node: ">=20", terminalAi: true },
			files,
		};
		await mkdir(join(staging, "dist"), { recursive: true });
		await writeFile(join(staging, "dist/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
		const zip = await createZip(staging);
		await mkdir(dirname(zipPath), { recursive: true });
		await writeFile(temporaryZip, zip, { flag: "wx" });
		await rm(outputDir, { recursive: true, force: true });
		await rename(staging, outputDir);
		await rm(zipPath, { force: true });
		await rename(temporaryZip, zipPath);
		const paths = [...files.map((file) => file.path), "dist/manifest.json"].sort();
		const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
		options.report?.(`INSTALL ${paths.length} files, ${bytes} bytes, ${zip.byteLength} zip bytes`);
		return { state: "INSTALL", files: paths, bytes, zipBytes: zip.byteLength };
	} catch (error) {
		await Promise.all([rm(staging, { recursive: true, force: true }), rm(temporaryZip, { force: true })]);
		if (error instanceof LightweightReleaseError) throw error;
		throw new LightweightReleaseError("경량 Release 생성에 실패했습니다.", { cause: error });
	}
}

function argument(args: readonly string[], flag: string): string | undefined {
	const index = args.indexOf(flag);
	return index < 0 ? undefined : args[index + 1];
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const outputDir = argument(args, "--output");
	const zipPath = argument(args, "--zip");
	if (!outputDir || !zipPath) {
		throw new LightweightReleaseError(
			"usage: build-lightweight.ts --output <directory> --zip <archive> [--source-root <directory>]",
		);
	}
	await buildLightweightRelease({
		sourceRoot: argument(args, "--source-root") ?? process.cwd(),
		outputDir,
		zipPath,
		report: (line) => process.stdout.write(`${line}\n`),
	});
}
