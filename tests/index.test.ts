import { describe, expect, test } from "bun:test";
import PACKAGE from "../package.json" with { type: "json" };
import PLUGIN_MANIFEST from "../plugins/claude-code/.claude-plugin/plugin.json" with { type: "json" };
import { buildProgram } from "../src/index.js";

describe("kch-ppt CLI scaffold", () => {
	test("program exposes help and version", () => {
		const program = buildProgram();
		expect(program.name()).toBe("kch-ppt-automation");
		expect(program.description()).toBe("KCH presentation automation CLI");
		expect(program.version()).toBe(PACKAGE.version);
		expect(PLUGIN_MANIFEST.version).toBe(PACKAGE.version);
		expect(program.options.map((option) => option.long)).toContain("--accept-claude-subscription-use");
	});
});
