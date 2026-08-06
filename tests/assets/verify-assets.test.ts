import { afterEach, expect, test } from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { verifyAssets } from "../../scripts/verify-assets.js";

const repo = resolve(import.meta.dir, "../..");
const tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

function fixture(): string {
	const root = mkdtempSync(join(tmpdir(), "kch-assets-"));
	tempRoots.push(root);
	mkdirSync(join(root, "assets"), { recursive: true });
	cpSync(join(repo, "assets", "manifest.json"), join(root, "assets", "manifest.json"));
	cpSync(join(repo, "reference"), join(root, "reference"), { recursive: true });
	return root;
}

test("validates the exact curated inventory and two distinct header skins", () => {
	expect(verifyAssets({ root: repo, sourceRoot: repo })).toBe(
		"KCH assets: verified 7 distributable assets; exact panorama ZIP member; distinct header skins.",
	);
});

test("rejects a MontBlanc fixture with KCH-E-ASSET-003", () => {
	const root = fixture();
	mkdirSync(join(root, "assets", "fonts"), { recursive: true });
	writeFileSync(join(root, "assets", "fonts", "MontBlanc-Demo.ttf"), "forbidden");
	expect(() => verifyAssets({ root, sourceRoot: repo })).toThrow("KCH-E-ASSET-003");
});
