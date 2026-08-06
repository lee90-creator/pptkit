import { AssetProvenanceSchema } from "../schema/asset.js";
import type { AssetProvenance } from "../schema/asset.js";
import type { ImageRequest } from "./types.js";

export function buildImageProvenance(input: {
	readonly request: ImageRequest;
	readonly source: AssetProvenance["source"];
	readonly identifier: string;
	readonly promptHash: string | null;
	readonly licenseStatus: string;
	readonly createdAt: string;
}): AssetProvenance {
	return AssetProvenanceSchema.parse({
		source: input.source,
		identifier: input.identifier,
		promptHash: input.promptHash,
		createdAt: input.createdAt,
		licenseStatus: input.licenseStatus,
		slideId: input.request.slideId,
	});
}
