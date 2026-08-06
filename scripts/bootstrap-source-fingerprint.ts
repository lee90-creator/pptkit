import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function bootstrapSourceFingerprint(
	sourceRoot: string,
	files: readonly (readonly [string, string])[],
	generatedFiles: Readonly<Record<string, string>>,
): Promise<string> {
	const hash = createHash("sha256");
	for (const [sourcePath, outputPath] of files) {
		hash
			.update(outputPath)
			.update("\0")
			.update(await readFile(join(sourceRoot, sourcePath)))
			.update("\0");
	}
	for (const [path, content] of Object.entries(generatedFiles).sort(([left], [right]) => left.localeCompare(right))) {
		hash.update(path).update("\0").update(content).update("\0");
	}
	hash.update(await readFile(join(sourceRoot, "dist/manifest.template.json")));
	return hash.digest("hex");
}
