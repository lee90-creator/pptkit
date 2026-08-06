import { expect, test } from "bun:test";

import { createClaudeJsonSchema } from "../../src/cli/provider-plan.js";

test("emits the Claude-supported JSON Schema draft", () => {
	const schema = JSON.parse(createClaudeJsonSchema()) as { readonly $schema?: string };
	expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#");
	expect(schema.$schema).not.toContain("2020-12");
});
