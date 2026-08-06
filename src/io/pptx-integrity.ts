import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";

export const REQUIRED_PPTX_PARTS = ["[Content_Types].xml", "ppt/presentation.xml"] as const;

export class PptxIntegrityError extends Error {
	readonly code = "KCH-E-OUTPUT-001" as const;

	constructor(message: string) {
		super(message);
		this.name = "PptxIntegrityError";
	}
}

export interface PptxIntegrity {
	readonly bytes: number;
	readonly sha256: string;
	readonly requiredParts: readonly ["[Content_Types].xml", "ppt/presentation.xml"];
}

function tokenizeXmlTags(xml: string): readonly string[] | undefined {
	const tags: string[] = [];
	let cursor = 0;
	while (cursor < xml.length) {
		const start = xml.indexOf("<", cursor);
		if (start < 0) {
			break;
		}
		let quote: '"' | "'" | undefined;
		let end = start + 1;
		for (; end < xml.length; end += 1) {
			const character = xml[end];
			if (quote !== undefined) {
				if (character === quote) {
					quote = undefined;
				}
				continue;
			}
			if (character === '"' || character === "'") {
				quote = character;
				continue;
			}
			if (character === ">") {
				break;
			}
		}
		if (end >= xml.length || quote !== undefined) {
			return undefined;
		}
		tags.push(xml.slice(start, end + 1));
		cursor = end + 1;
	}
	return tags;
}

function isWellFormedXmlRoot(xml: string, expectedRoot: "Types" | "p:presentation"): boolean {
	const body = xml
		.trim()
		.replace(/<!--[\s\S]*?-->/gu, "")
		.replace(/^<\?xml[^>]*>\s*/u, "");
	const tags = tokenizeXmlTags(body);
	if (tags === undefined) {
		return false;
	}
	const stack: string[] = [];
	let root: string | undefined;
	let rootClosed = false;
	for (const tag of tags) {
		if (tag.startsWith("<?") || tag.startsWith("<!")) {
			continue;
		}
		const inner = tag.slice(1, -1).trim();
		if (inner.startsWith("/")) {
			const closing = /^\/([A-Za-z_][\w:.-]*)\s*$/u.exec(inner);
			const closingName = closing?.[1];
			if (closingName === undefined || stack.pop() !== closingName) {
				return false;
			}
			if (stack.length === 0) {
				rootClosed = true;
			}
			continue;
		}
		const selfClosing = inner.endsWith("/");
		const openingBody = selfClosing ? inner.slice(0, -1).trimEnd() : inner;
		const opening = /^([A-Za-z_][\w:.-]*)(?:\s|$)/u.exec(openingBody);
		const openingName = opening?.[1];
		if (openingName === undefined || (rootClosed && stack.length === 0)) {
			return false;
		}
		if (root === undefined) {
			root = openingName;
		}
		if (!selfClosing) {
			stack.push(openingName);
		} else if (stack.length === 0) {
			rootClosed = true;
		}
	}
	return root === expectedRoot && rootClosed && stack.length === 0;
}

export async function inspectPptxIntegrity(filePath: string): Promise<PptxIntegrity> {
	const bytes = await readFile(filePath);
	if (bytes.byteLength === 0) {
		throw new PptxIntegrityError("PPTX 파일이 비어 있습니다.");
	}
	let zip: JSZip;
	try {
		zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
	} catch {
		throw new PptxIntegrityError("PPTX ZIP 중앙 디렉터리 또는 CRC가 손상되었습니다.");
	}
	for (const requiredPart of REQUIRED_PPTX_PARTS) {
		if (zip.file(requiredPart) === null) {
			throw new PptxIntegrityError(`PPTX 필수 구성요소가 없습니다: ${requiredPart}`);
		}
	}
	const contentTypes = await zip.file(REQUIRED_PPTX_PARTS[0])?.async("string");
	const presentation = await zip.file(REQUIRED_PPTX_PARTS[1])?.async("string");
	if (
		contentTypes === undefined ||
		presentation === undefined ||
		!isWellFormedXmlRoot(contentTypes, "Types") ||
		!isWellFormedXmlRoot(presentation, "p:presentation")
	) {
		throw new PptxIntegrityError("PPTX 필수 XML 루트가 올바르지 않습니다.");
	}
	return {
		bytes: bytes.byteLength,
		sha256: createHash("sha256").update(bytes).digest("hex"),
		requiredParts: REQUIRED_PPTX_PARTS,
	};
}
