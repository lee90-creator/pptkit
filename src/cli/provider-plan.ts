import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { ProviderNarrativeSchema } from "../planner/normalize.js";
import { executeClaude } from "../providers/claude.js";
import { executeCodex } from "../providers/codex.js";
import type { ProviderName } from "../providers/contract.js";
import { requireAllJsonSchemaProperties } from "../providers/json-schema.js";
import { NodeProcessRunner } from "../providers/process.js";

export const DemoProviderNarrativeSchema = ProviderNarrativeSchema.extend({
	slides: ProviderNarrativeSchema.shape.slides.length(17),
});

export interface InvokeProviderPlanRequest {
	readonly provider: ProviderName;
	readonly executable: string;
	readonly prompt: string;
	readonly acceptClaudeSubscriptionUse: boolean;
	readonly localAppData: string;
	readonly rerunCommand: string;
}

export function createClaudeJsonSchema(): string {
	return JSON.stringify(z.toJSONSchema(DemoProviderNarrativeSchema, { target: "draft-7" }));
}

export async function invokeProviderPlan(request: InvokeProviderPlanRequest): Promise<unknown> {
	const runner = new NodeProcessRunner();
	if (request.provider === "claude") {
		return (
			await executeClaude({
				executable: request.executable,
				prompt: request.prompt,
				outputSchema: DemoProviderNarrativeSchema,
				jsonSchema: createClaudeJsonSchema(),
				runner,
				timeoutMs: 600_000,
				localAppData: request.localAppData,
				accept: request.acceptClaudeSubscriptionUse,
				rerunCommand: request.rerunCommand,
			})
		).value;
	}
	const owned = await mkdtemp(join(tmpdir(), "kch-codex-schema-"));
	try {
		const schemaPath = join(owned, "provider-narrative.schema.json");
		const schema = requireAllJsonSchemaProperties(z.toJSONSchema(DemoProviderNarrativeSchema));
		await writeFile(schemaPath, `${JSON.stringify(schema, null, 2)}\n`);
		return (
			await executeCodex({
				executable: request.executable,
				prompt: request.prompt,
				outputSchema: DemoProviderNarrativeSchema,
				jsonSchemaPath: schemaPath,
				runner,
				timeoutMs: 600_000,
			})
		).value;
	} finally {
		await rm(owned, { recursive: true, force: true });
	}
}
