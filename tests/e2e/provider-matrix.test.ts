import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import { runProviderMatrix } from "../../scripts/run-provider-matrix.js";
import { canRunProviderMatrix } from "../support/windows-environment.js";

const roots: string[] = [];
const installRoot = resolve(
	".omo/evidence/ulw/kch-ppt-automation-execution-20260803/G001-execute-the-complete-immutable-plan/a1/task-11-real-install",
);

afterAll(async () => {
	await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
}, 30_000);

describe.skipIf(!canRunProviderMatrix(existsSync(installRoot)))("real CLI provider adversarial matrix", () => {
	test("passes all six child-process rows with deterministic routing and preservation", async () => {
		const evidenceRoot = await mkdtemp(join(tmpdir(), "kch-provider-matrix-"));
		roots.push(evidenceRoot);
		const result = await runProviderMatrix({
			installRoot,
			fakeRoot: resolve("tests/fixtures/providers/windows"),
			evidenceRoot,
		});
		expect(result.rows).toHaveLength(6);
		expect(result.rows.every((row) => row.status === "PASS")).toBe(true);
		expect(result.rows.find((row) => row.name === "both")?.selectedProvider).toBe("codex");
		expect(result.rows.find((row) => row.name === "neither")?.targetCreated).toBe(false);
		expect(result.rows.find((row) => row.name === "malformed")?.targetCreated).toBe(false);
		expect(result.rows.find((row) => row.name === "image-failure")?.imageStatus).toBe("native-fallback");
	}, 120_000);
});
