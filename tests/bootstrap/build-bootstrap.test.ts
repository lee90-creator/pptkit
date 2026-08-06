import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import JSZip from "jszip";

import {
	BootstrapBuildError,
	type BuildBootstrapOptions,
	buildBootstrapDistribution,
} from "../../scripts/build-bootstrap.js";

const roots: string[] = [];

setDefaultTimeout(60_000);

function tar(files: Record<string, string>): Uint8Array {
	const chunks: Buffer[] = [];
	for (const [name, value] of Object.entries(files)) {
		const body = Buffer.from(value);
		const header = Buffer.alloc(512);
		header.write(name, 0, 100, "utf8");
		header.write("0000644\0", 100, 8, "ascii");
		header.write("0000000\0", 108, 8, "ascii");
		header.write("0000000\0", 116, 8, "ascii");
		header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
		header.fill(32, 148, 156);
		header.write("0", 156, 1, "ascii");
		header.write("ustar\0", 257, 6, "ascii");
		const sum = [...header].reduce((total, byte) => total + byte, 0);
		header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
		chunks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
	}
	return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

async function fixture(pathTraversal?: string): Promise<{
	options: BuildBootstrapOptions;
	fetches: string[];
	writes: string[];
	output: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "kch-builder-"));
	roots.push(root);
	const source = join(root, "source");
	const output = join(root, "output");
	await cp(new URL("../../tools-lock.json", import.meta.url), join(source, "tools-lock.json"));
	const staticFiles: Record<string, string> = {
		"dist/app/kch-ppt.cjs": "app",
		"dist/manifest.template.json": '{"schemaVersion":1}',
		"assets/manifest.json": '{"version":1,"assets":[]}',
		"assets/logos/KCH_LOGOV2.png": "logo",
		"assets/fonts/Pretendard-Regular.ttf": "font",
		"setup/bootstrap.ps1": "bootstrap",
		"setup/install-fonts.ps1": "fonts",
		"src/office-qa/powerpoint.ps1": "office",
		"plugins/claude-code/skills/kchppt/SKILL.md": "claude-kchppt",
		"plugins/codex/skills/kchppt/SKILL.md": "codex-kchppt",
	};
	for (const [name, value] of Object.entries(staticFiles)) {
		await mkdir(dirname(join(source, name)), { recursive: true });
		await writeFile(join(source, name), value);
	}
	const zip = new JSZip();
	zip.file(pathTraversal ?? "node-v22.22.2-win-x64/node.exe", "node");
	const nodeBytes = await zip.generateAsync({ type: "uint8array" });
	const packageNames = ["claude", "claude-win", "codex", "codex-win"];
	const archives = [
		nodeBytes,
		...packageNames.map((name) =>
			tar({
				"package/package.json": JSON.stringify({ name }),
				"package/bin/tool.js": name,
				...(name === "claude" ? { "package/bin/claude.exe": "claude-wrapper" } : {}),
				...(name === "claude-win" ? { "package/claude.exe": "claude-native" } : {}),
			}),
		),
	];
	const lock = JSON.parse(await readFile(join(source, "tools-lock.json"), "utf8")) as {
		payloads: Array<{ url: string; integrity: string }>;
	};
	const byUrl = new Map(lock.payloads.map((payload, index) => [payload.url, archives[index] as Uint8Array]));
	const expected = new Map(
		archives.map((bytes, index) => [Buffer.from(bytes).toString("base64"), lock.payloads[index]?.integrity]),
	);
	const fetches: string[] = [];
	const writes: string[] = [];
	return {
		output,
		fetches,
		writes,
		options: {
			sourceRoot: source,
			outputDir: output,
			fetch: async (url) => {
				fetches.push(url);
				const bytes = byUrl.get(url);
				if (!bytes) return new Response(null, { status: 404 });
				return new Response(bytes);
			},
			payloadDigest: (bytes, algorithm) => {
				const integrity = expected.get(Buffer.from(bytes).toString("base64"));
				if (!integrity) return createHash(algorithm).update(bytes).digest();
				const encoded = integrity.slice(integrity.indexOf("-") + 1);
				return algorithm === "sha256" ? Buffer.from(encoded, "hex") : Buffer.from(encoded, "base64");
			},
			writeFile: async (path, data) => {
				writes.push(path);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, data);
			},
		},
	};
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("pinned bootstrap distribution builder", () => {
	test("stages all locked payloads and complete offline support files", async () => {
		const subject = await fixture();
		const result = await buildBootstrapDistribution(subject.options);
		expect(result).toMatchObject({ state: "INSTALL", downloads: 5 });
		expect(subject.fetches).toHaveLength(5);
		expect(subject.writes.length).toBeGreaterThan(15);
		expect(await readFile(join(subject.output, "dist/runtime/node-v22.22.2-win-x64/node.exe"), "utf8")).toBe("node");
		expect(
			await readFile(
				join(subject.output, "dist/tools/claude/node_modules/@anthropic-ai/claude-code/bin/tool.js"),
				"utf8",
			),
		).toBe("claude");
		expect(await readFile(join(subject.output, "dist/office-qa/powerpoint.ps1"), "utf8")).toBe("office");
		expect(await readFile(join(subject.output, "plugins/claude-code/skills/kchppt/SKILL.md"), "utf8")).toBe(
			"claude-kchppt",
		);
		expect(await readFile(join(subject.output, "plugins/codex/skills/kchppt/SKILL.md"), "utf8")).toBe("codex-kchppt");
		expect(await readFile(join(subject.output, "dist/run.bat"), "utf8")).toContain("bootstrap.ps1");
		expect(await readFile(join(subject.output, "dist/run.bat"), "utf8")).toContain("chcp 65001");
		expect(await readFile(join(subject.output, "dist/tools/claude/bin/claude.cmd"), "utf8")).toContain(
			"cli-wrapper.cjs",
		);
		expect(await readFile(join(subject.output, "dist/tools/claude/bin/claude.exe"), "utf8")).toBe("claude-native");
		expect(await readFile(join(subject.output, "dist/tools/codex/bin/codex.cmd"), "utf8")).toContain("codex.js");
	}, 60_000);

	test("verified rerun performs zero downloads and zero writes and reports SKIP", async () => {
		const subject = await fixture();
		await buildBootstrapDistribution(subject.options);
		subject.fetches.length = 0;
		subject.writes.length = 0;
		expect(await buildBootstrapDistribution(subject.options)).toMatchObject({ state: "SKIP", downloads: 0, writes: 0 });
		expect(subject.fetches).toEqual([]);
		expect(subject.writes).toEqual([]);
	}, 60_000);

	test("restages changed application sources while reusing all verified cached payloads", async () => {
		const subject = await fixture();
		await buildBootstrapDistribution(subject.options);
		subject.fetches.length = 0;
		subject.writes.length = 0;
		await writeFile(join(dirname(subject.output), "source/dist/app/kch-ppt.cjs"), "app-v2");
		expect(await buildBootstrapDistribution(subject.options)).toMatchObject({ state: "INSTALL", downloads: 0 });
		expect(subject.fetches).toEqual([]);
		expect(subject.writes.length).toBeGreaterThan(0);
		expect(
			subject.writes.some(
				(path) => path.includes("/.payloads/") || path.includes("/dist/runtime/") || path.includes("/node_modules/"),
			),
		).toBe(false);
		expect(await readFile(join(subject.output, "dist/app/kch-ppt.cjs"), "utf8")).toBe("app-v2");
	}, 60_000);

	test("deletes and rejects a corrupt cached payload with the bootstrap error code", async () => {
		const subject = await fixture();
		await mkdir(join(subject.output, ".payloads"), { recursive: true });
		const cached = join(subject.output, ".payloads/node-win32-x64.zip");
		await writeFile(cached, "corrupt");
		await expect(buildBootstrapDistribution(subject.options)).rejects.toMatchObject({ code: "KCH-E-BOOTSTRAP-001" });
		await expect(readFile(cached)).rejects.toBeDefined();
		expect(subject.fetches).toEqual([]);
	}, 60_000);

	test("rejects archive path traversal before writing extracted content", async () => {
		const subject = await fixture("node-v22.22.2-win-x64/../../escaped.exe");
		await expect(buildBootstrapDistribution(subject.options)).rejects.toBeInstanceOf(BootstrapBuildError);
		await expect(readFile(join(subject.output, "escaped.exe"))).rejects.toBeDefined();
	}, 60_000);
});
