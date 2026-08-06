import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, sep } from "node:path";
import { inflateRawSync } from "node:zlib";

import { EXPECTED_ASSETS } from "./verify-assets-contract.js";
import type { ExpectedAsset } from "./verify-assets-contract.js";

type Asset = ExpectedAsset;
const EXPECTED = EXPECTED_ASSETS;
const FORBIDDEN = /mont|nanumsquare|tmon|omni|inter/i;
function fail(code: string, message: string): never {
	throw new Error(`${code}: ${message}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value: unknown, label: string): Record<string, unknown> {
	if (!isRecord(value)) fail("KCH-E-ASSET-001", `${label} must be an object`);
	return value;
}
function text(value: Record<string, unknown>, key: string): string {
	const item = value[key];
	if (typeof item !== "string") fail("KCH-E-ASSET-001", `${key} must be a string`);
	return item;
}
function number(value: Record<string, unknown>, key: string): number {
	const item = value[key];
	if (typeof item !== "number" || !Number.isFinite(item)) fail("KCH-E-ASSET-001", `${key} must be a finite number`);
	return item;
}
function optionalText(value: Record<string, unknown>, key: string): string | undefined {
	const item = value[key];
	if (item === undefined) return undefined;
	if (typeof item !== "string") fail("KCH-E-ASSET-001", `${key} must be a string`);
	return item;
}
function optionalNumber(value: Record<string, unknown>, key: string): number | undefined {
	const item = value[key];
	if (item === undefined) return undefined;
	if (typeof item !== "number" || !Number.isFinite(item)) fail("KCH-E-ASSET-001", `${key} must be a finite number`);
	return item;
}
function asset(value: unknown): Asset {
	const item = object(value, "asset");
	return {
		id: text(item, "id"),
		distributionPath: text(item, "distributionPath"),
		sourcePath: text(item, "sourcePath"),
		packageMember: optionalText(item, "packageMember"),
		sha256: text(item, "sha256"),
		bytes: number(item, "bytes"),
		role: text(item, "role"),
		licenseStatus: text(item, "licenseStatus"),
		width: optionalNumber(item, "width"),
		height: optionalNumber(item, "height"),
		colorType: optionalNumber(item, "colorType"),
	};
}
function hash(data: Uint8Array): string {
	return createHash("sha256").update(data).digest("hex");
}
function same(a: Asset, b: Asset): boolean {
	return (
		a.id === b.id &&
		a.distributionPath === b.distributionPath &&
		a.sourcePath === b.sourcePath &&
		a.packageMember === b.packageMember &&
		a.sha256 === b.sha256 &&
		a.bytes === b.bytes &&
		a.role === b.role &&
		a.licenseStatus === b.licenseStatus &&
		a.width === b.width &&
		a.height === b.height &&
		a.colorType === b.colorType
	);
}
function png(data: Buffer, target: Asset): void {
	if (data.length < 26 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
		fail("KCH-E-ASSET-002", `${target.id} is not PNG`);
	if (
		data.readUInt32BE(16) !== target.width ||
		data.readUInt32BE(20) !== target.height ||
		data[25] !== target.colorType
	)
		fail("KCH-E-ASSET-002", `${target.id} dimensions/color type differ`);
}
function u16(data: Buffer, offset: number): number {
	if (offset + 2 > data.length) fail("KCH-E-ASSET-004", "truncated ZIP");
	return data.readUInt16LE(offset);
}
function u32(data: Buffer, offset: number): number {
	if (offset + 4 > data.length) fail("KCH-E-ASSET-004", "truncated ZIP");
	return data.readUInt32LE(offset);
}
function zipMember(file: Buffer, wanted: string): Buffer {
	let end = -1;
	for (let i = file.length - 22; i >= Math.max(0, file.length - 65557); i--)
		if (u32(file, i) === 0x06054b50) {
			end = i;
			break;
		}
	if (end < 0 || u16(file, end + 4) !== 0 || u16(file, end + 6) !== 0) fail("KCH-E-ASSET-004", "invalid ZIP directory");
	const count = u16(file, end + 10);
	let offset = u32(file, end + 16);
	let found: { method: number; compressed: number; size: number; local: number } | undefined;
	for (let index = 0; index < count; index++) {
		if (u32(file, offset) !== 0x02014b50) fail("KCH-E-ASSET-004", "invalid ZIP entry");
		const method = u16(file, offset + 10);
		const compressed = u32(file, offset + 20);
		const size = u32(file, offset + 24);
		const names = u16(file, offset + 28);
		const extra = u16(file, offset + 30);
		const comment = u16(file, offset + 32);
		const local = u32(file, offset + 42);
		const next = offset + 46 + names + extra + comment;
		if (next > file.length) fail("KCH-E-ASSET-004", "truncated ZIP entry");
		const name = file.subarray(offset + 46, offset + 46 + names).toString("utf8");
		if (name.split("/").includes("..")) fail("KCH-E-ASSET-004", "ZIP path traversal");
		if (name === wanted) {
			if (found) fail("KCH-E-ASSET-004", "duplicate ZIP member");
			found = { method, compressed, size, local };
		}
		offset = next;
	}
	if (!found) fail("KCH-E-ASSET-004", `missing exact ZIP member ${wanted}`);
	if (u32(file, found.local) !== 0x04034b50) fail("KCH-E-ASSET-004", "invalid ZIP local entry");
	const names = u16(file, found.local + 26);
	const extra = u16(file, found.local + 28);
	const start = found.local + 30 + names + extra;
	if (
		file.subarray(found.local + 30, found.local + 30 + names).toString("utf8") !== wanted ||
		start + found.compressed > file.length
	)
		fail("KCH-E-ASSET-004", "nonexact ZIP member");
	const compressed = file.subarray(start, start + found.compressed);
	const result =
		found.method === 0
			? compressed
			: found.method === 8
				? inflateRawSync(compressed)
				: fail("KCH-E-ASSET-004", "unsupported ZIP compression");
	if (result.length !== found.size) fail("KCH-E-ASSET-004", "ZIP member size mismatch");
	return result;
}
function inventory(directory: string): string[] {
	if (!existsSync(directory)) return [];
	return readdirSync(directory, { withFileTypes: true }).flatMap((item) =>
		item.isDirectory() ? inventory(resolve(directory, item.name)) : [resolve(directory, item.name)],
	);
}
function geometry(
	file: string,
	skin: string,
	required: readonly string[],
): { titleX: number; hasVerticalBand: boolean } {
	const value = object(JSON.parse(readFileSync(file, "utf8")), file);
	const canvas = object(value.canvas, "canvas");
	const anchors = object(value.anchors, "anchors");
	if (text(value, "skin") !== skin || number(canvas, "width") !== 960 || number(canvas, "height") !== 540)
		fail("KCH-E-ASSET-005", `${skin} geometry identity differs`);
	for (const key of required) {
		const anchor = object(anchors[key], key);
		for (const coordinate of ["x", "y", "width", "height"]) number(anchor, coordinate);
	}
	return { titleX: number(object(anchors.title, "title"), "x"), hasVerticalBand: anchors.verticalBand !== undefined };
}
export interface VerifyAssetsOptions {
	readonly root: string;
	readonly sourceRoot: string;
}

function options(): VerifyAssetsOptions {
	const values = process.argv.slice(2);
	let root = process.cwd();
	let sourceRoot = process.cwd();
	for (let index = 0; index < values.length; index++) {
		const flag = values[index];
		const value = values[index + 1];
		if ((flag !== "--root" && flag !== "--source-root") || value === undefined)
			fail("KCH-E-ASSET-001", "usage: verify-assets.ts [--root path] [--source-root path]");
		if (flag === "--root") root = resolve(value);
		else sourceRoot = resolve(value);
		index++;
	}
	return { root, sourceRoot };
}

export function verifyAssets({ root, sourceRoot }: VerifyAssetsOptions): string {
	const manifest = object(JSON.parse(readFileSync(resolve(root, "assets/manifest.json"), "utf8")), "manifest");
	if (
		number(manifest, "version") !== 1 ||
		typeof manifest.distributionScope !== "string" ||
		!Array.isArray(manifest.assets)
	)
		fail("KCH-E-ASSET-001", "invalid manifest");
	const declared = manifest.assets.map(asset);
	if (declared.length !== EXPECTED.length || new Set(declared.map((item) => item.id)).size !== EXPECTED.length)
		fail("KCH-E-ASSET-003", "duplicate or missing manifest entry");
	const allowed = new Set(["assets/manifest.json", ...EXPECTED.map((item) => item.distributionPath)]);
	for (const file of inventory(resolve(root, "assets"))) {
		const relative = file
			.slice(root.length + 1)
			.split(sep)
			.join("/");
		if (!allowed.has(relative) || FORBIDDEN.test(relative))
			fail("KCH-E-ASSET-003", `forbidden or unmanifested asset ${relative}`);
	}
	for (const expected of EXPECTED) {
		const actual = declared.find((item) => item.id === expected.id);
		if (!actual || !same(actual, expected)) fail("KCH-E-ASSET-002", `manifest contract differs for ${expected.id}`);
		const stored = readFileSync(resolve(root, expected.distributionPath));
		const source = expected.packageMember
			? zipMember(readFileSync(resolve(sourceRoot, expected.sourcePath)), expected.packageMember)
			: readFileSync(resolve(sourceRoot, expected.sourcePath));
		if (expected.width !== undefined) {
			png(stored, expected);
			png(source, expected);
		}
		if (
			stored.length !== expected.bytes ||
			source.length !== expected.bytes ||
			hash(stored) !== expected.sha256 ||
			hash(source) !== expected.sha256
		)
			fail("KCH-E-ASSET-002", `hash/size differs for ${expected.id}`);
	}
	const kch = geometry(resolve(root, "reference/geometry/kch-framed-right.json"), "kch-framed-right", [
		"rightFrame",
		"verticalBand",
		"sectionNumber",
		"title",
		"logo",
		"topRule",
	]);
	const shinan = geometry(resolve(root, "reference/geometry/shinan-line-left.json"), "shinan-line-left", [
		"brandLockup",
		"topRule",
		"title",
		"content",
		"panorama",
	]);
	if (!kch.hasVerticalBand || shinan.hasVerticalBand || kch.titleX === shinan.titleX)
		fail("KCH-E-ASSET-005", "header skins are averaged");
	return "KCH assets: verified 7 distributable assets; exact panorama ZIP member; distinct header skins.";
}

if (import.meta.main) {
	try {
		process.stdout.write(`${verifyAssets(options())}\n`);
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : "KCH-E-ASSET-001: unknown failure"}\n`);
		process.exitCode = 1;
	}
}
