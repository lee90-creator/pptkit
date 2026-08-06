import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

import { BOOTSTRAP_STEP_IDS, INSTALL_ROOT } from "../../src/bootstrap/contract.js";
import {
	PayloadLockError,
	loadToolsLock,
	validatePackageClosure,
	validateToolsLock,
} from "../../src/bootstrap/manifest.js";
import { buildBootstrapPlan, classifySupportTier } from "../../src/bootstrap/support-tier.js";

async function json(path: string): Promise<unknown> {
	return JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
}

describe("frozen offline payload lock", () => {
	test("contains the exact five frozen payload records and complete dependency closure", async () => {
		const lock = await loadToolsLock(new URL("../../tools-lock.json", import.meta.url));
		expect(lock.payloads).toHaveLength(5);
		expect(lock.payloads.map(({ id }) => id)).toEqual([
			"node-win32-x64",
			"claude-code",
			"claude-code-win32-x64",
			"codex",
			"codex-win32-x64",
		]);
		expect(lock.payloads).toEqual([
			{
				id: "node-win32-x64",
				package: "node",
				version: "22.22.2",
				url: "https://nodejs.org/dist/v22.22.2/node-v22.22.2-win-x64.zip",
				integrity: "sha256-7c93e9d92bf68c07182b471aa187e35ee6cd08ef0f24ab060dfff605fcc1c57c",
				extractPath: "dist/runtime/node-v22.22.2-win-x64",
				dependencies: [],
			},
			{
				id: "claude-code",
				package: "@anthropic-ai/claude-code",
				version: "2.1.220",
				url: "https://registry.npmjs.org/@anthropic-ai/claude-code/-/claude-code-2.1.220.tgz",
				integrity: "sha512-ogBrvwkqF9f8okmnXKxmRNHuvtFxFEffe5pWdqOV3iQDxlUOKirFqnyWC7NGXXnDA4WkkbPH8pvSbwyCR2Auyw==",
				extractPath: "dist/tools/claude/node_modules/@anthropic-ai/claude-code",
				dependencies: [{ package: "@anthropic-ai/claude-code-win32-x64", version: "2.1.220" }],
			},
			{
				id: "claude-code-win32-x64",
				package: "@anthropic-ai/claude-code-win32-x64",
				version: "2.1.220",
				url: "https://registry.npmjs.org/@anthropic-ai/claude-code-win32-x64/-/claude-code-win32-x64-2.1.220.tgz",
				integrity: "sha512-UGrjH8cGhC6PzhTyZSdgf/RpKxpfk9XJZ/RT/wsG2AJg9yEJLjLg6/TrnlL8RFbEv6Zahu0Quytc02UOpA/GiA==",
				extractPath: "dist/tools/claude/node_modules/@anthropic-ai/claude-code-win32-x64",
				dependencies: [],
			},
			{
				id: "codex",
				package: "@openai/codex",
				version: "0.145.0",
				url: "https://registry.npmjs.org/@openai/codex/-/codex-0.145.0.tgz",
				integrity: "sha512-/PSPSFujjjmiyVFvG2yu/grOFhsWdokTH8t2KGWhXSo/M5n/dIDsnbsnO82/7bLtIoDuzQf7ATBUMWqPWQINlQ==",
				extractPath: "dist/tools/codex/node_modules/@openai/codex",
				dependencies: [
					{
						package: "@openai/codex-win32-x64",
						resolvesPackage: "@openai/codex",
						version: "0.145.0-win32-x64",
					},
				],
			},
			{
				id: "codex-win32-x64",
				package: "@openai/codex",
				alias: "@openai/codex-win32-x64",
				version: "0.145.0-win32-x64",
				url: "https://registry.npmjs.org/@openai/codex/-/codex-0.145.0-win32-x64.tgz",
				integrity: "sha512-u0h9lk094CaXRSqE34SBW2dRaQTPa6fASXqehczWH9QdsU62mBsiAgAdp6tCG4i+YzPmmhjD8FdXNnYGNmwuMg==",
				extractPath: "dist/tools/codex/node_modules/@openai/codex-win32-x64",
				dependencies: [],
			},
		]);
	});

	test("rejects an extra unowned platform dependency", async () => {
		const lock = await loadToolsLock(new URL("../../tools-lock.json", import.meta.url));
		const mutated = structuredClone(lock);
		mutated.payloads[2]?.dependencies.push({ package: "unexpected", version: "1.0.0" });
		expect(() => validateToolsLock(mutated)).toThrow(PayloadLockError);
	});

	test("validates root optional edges and zero-dependency platform package metadata", async () => {
		const lock = await loadToolsLock(new URL("../../tools-lock.json", import.meta.url));
		const metadata = {
			claudeRoot: await json("./fixtures/claude-root-package.json"),
			claudePlatform: await json("./fixtures/claude-platform-package.json"),
			codexRoot: await json("./fixtures/codex-root-package.json"),
			codexPlatform: await json("./fixtures/codex-platform-package.json"),
		};
		const closure = validatePackageClosure(lock, metadata);
		expect(closure.claudeRoot.optionalDependencies).toEqual({
			"@anthropic-ai/claude-code-win32-x64": "2.1.220",
		});
		expect(closure.codexRoot.optionalDependencies).toEqual({
			"@openai/codex-win32-x64": "npm:@openai/codex@0.145.0-win32-x64",
		});
		expect(closure.claudePlatform.dependencies).toEqual({});
		expect(closure.codexPlatform.dependencies).toEqual({});

		const invalidPlatform = {
			...metadata,
			codexPlatform: {
				name: "@openai/codex",
				version: "0.145.0-win32-x64",
				dependencies: { unexpected: "1.0.0" },
				optionalDependencies: {},
			},
		};
		expect(() => validatePackageClosure(lock, invalidPlatform)).toThrow(PayloadLockError);
	});

	test("distribution template addresses staged installations and never the old path", async () => {
		const template = await json("../../dist/manifest.template.json");
		const lock = await loadToolsLock(new URL("../../tools-lock.json", import.meta.url));
		const serialized = JSON.stringify(template);
		expect(serialized).toContain("%LOCALAPPDATA%\\\\KCH\\\\PptAutomation");
		expect(serialized).not.toMatch(/PptKit/iu);
		expect(serialized).toContain("dist/tools/claude/node_modules/@anthropic-ai/claude-code");
		expect(serialized).toContain("dist/tools/codex/node_modules/@openai/codex");
		expect(serialized).toContain("claude.cmd");
		expect(serialized).toContain("codex.cmd");
		for (const payload of lock.payloads) {
			expect(serialized).toContain(payload.integrity);
		}
	});
});

describe("support tiers and bootstrap protocol", () => {
	test("classifies A-tier and returns the exact ordered step protocol", async () => {
		const fixture = await json("./fixtures/tier-a.json");
		expect(classifySupportTier(fixture).tier).toBe("A");
		const plan = buildBootstrapPlan(fixture);
		expect(plan.map(({ id }) => id)).toEqual([...BOOTSTRAP_STEP_IDS]);
		expect(plan.every(({ state }) => state === "CHECK")).toBe(true);
		expect(INSTALL_ROOT).toBe("%LOCALAPPDATA%\\KCH\\PptAutomation");
	});

	test("classifies degraded capabilities as B-tier warnings", async () => {
		const fixture = await json("./fixtures/tier-b.json");
		const classification = classifySupportTier(fixture);
		expect(classification.tier).toBe("B");
		expect(classification.risks).toEqual(["network", "office", "font-policy"]);
		expect(buildBootstrapPlan(fixture).some(({ state }) => state === "WARN")).toBe(true);
	});

	test("classifies AppLocker as C-tier R-STOP without any install attempt", async () => {
		const fixture = await json("./fixtures/tier-c-applocker.json");
		const classification = classifySupportTier(fixture);
		expect(classification).toMatchObject({ tier: "C", receipt: { policy: "AppLocker" } });
		const plan = buildBootstrapPlan(fixture);
		expect(plan).toHaveLength(1);
		const blocked = plan[0];
		expect(blocked).toMatchObject({
			state: "BLOCKED",
			supportTier: "C",
			path: "%LOCALAPPDATA%\\KCH\\PptAutomation\\runtime\\node.exe",
			sha256: "a".repeat(64),
		});
		if (blocked?.state !== "BLOCKED") {
			throw new Error("expected a blocked bootstrap receipt");
		}
		expect(blocked.itAction).toMatch(/[가-힣]/u);
		expect(plan.some(({ state }) => state === "INSTALL")).toBe(false);
	});
});
