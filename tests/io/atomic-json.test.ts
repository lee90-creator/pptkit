import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { writeJsonExclusive } from "../../src/io/atomic-json.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kch-atomic-json-"));
	roots.push(root);
	return root;
}

describe("exclusive JSON receipts", () => {
	test("writes a JSON receipt without leaving a temporary file", async () => {
		const root = await workspace();
		const target = join(root, "receipt.json");
		await writeJsonExclusive(target, { status: "created" });
		expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ status: "created" });
		expect((await readdir(root)).filter((name) => name.includes(".kch-tmp-"))).toEqual([]);
	});

	test("preserves a target created by a competing process", async () => {
		const root = await workspace();
		const target = join(root, "receipt.json");
		await writeFile(target, "competing");
		await expect(writeJsonExclusive(target, { status: "created" })).rejects.toMatchObject({
			code: "KCH-E-OUTPUT-002",
		});
		expect(await readFile(target, "utf8")).toBe("competing");
		expect((await readdir(root)).filter((name) => name.includes(".kch-tmp-"))).toEqual([]);
	});
});
