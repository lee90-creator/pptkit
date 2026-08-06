function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireAllJsonSchemaProperties(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(requireAllJsonSchemaProperties);
	}
	if (!isRecord(schema)) {
		return schema;
	}
	const normalized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(schema)) {
		normalized[key] = requireAllJsonSchemaProperties(value);
	}
	if (isRecord(schema.properties)) {
		normalized.required = Object.keys(schema.properties);
	}
	return normalized;
}
