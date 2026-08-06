import { z } from "zod";

import { ProviderNarrativeSchema } from "./normalize.js";

export function buildPlannerPrompt(): string {
	return JSON.stringify({
		task: "Return one narrative object that satisfies the supplied JSON Schema.",
		schema: z.toJSONSchema(ProviderNarrativeSchema),
	});
}
