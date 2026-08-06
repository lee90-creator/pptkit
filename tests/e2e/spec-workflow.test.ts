import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import JSZip from "jszip";

import { runSpecWorkflow } from "../../src/cli/spec-workflow.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function root(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "kch-spec-workflow-"));
	roots.push(directory);
	return directory;
}

function occurrences(text: string, value: string): number {
	return text.split(value).length - 1;
}

describe("conversation-spec workflow", () => {
	test("renders the validated conversation content as editable KCH slides", async () => {
		const directory = await root();
		const specPath = join(directory, "request.json");
		const outputPath = join(directory, "result.pptx");
		await writeFile(
			specPath,
			JSON.stringify({
				title: "2027년 사업계획",
				purpose: "경영진 투자 의사결정",
				audience: "KCH 경영진",
				mode: "corporate",
				slides: [
					{
						id: "investment-summary",
						purpose: "핵심 투자안 요약",
						claim: "선택과 집중으로 투자 효율을 높입니다.",
						title: "투자안 요약",
						bodyBlocks: [
							{ title: "목표", text: "핵심 사업에 자원을 집중합니다." },
							{ title: "기준", text: "수익성과 실행 가능성을 함께 검토합니다." },
						],
						visual: {
							type: "metric",
							sourceData: [
								{ label: "목표 IRR", value: 12, unit: "%" },
								{ label: "투자 기간", value: 4, unit: "년" },
							],
						},
						imageIntent: { action: "none", nativeFallback: "metric" },
						usePanorama: false,
					},
				],
			}),
		);

		const result = await runSpecWorkflow(
			{ specPath, outputPath, officeQa: false },
			{ assetRoot: resolve("assets"), now: () => new Date("2026-08-06T00:00:00.000Z") },
		);

		expect(result.slideCount).toBe(1);
		expect(result.integrity.bytes).toBeGreaterThan(0);
		expect(result.officeQa).toMatchObject({ status: "render-unverified", reason: "disabled-by-user" });
		const archive = await JSZip.loadAsync(await readFile(outputPath));
		const slideXml = await archive.file("ppt/slides/slide1.xml")?.async("string");
		expect(slideXml).toContain("투자안 요약");
		expect(slideXml).toContain("선택과 집중으로 투자 효율을 높입니다.");
		expect(slideXml).toContain("목표 IRR");
		expect(slideXml).toContain("12%");
	});

	test("rejects an invalid spec before creating a PowerPoint file", async () => {
		const directory = await root();
		const specPath = join(directory, "invalid.json");
		const outputPath = join(directory, "invalid.pptx");
		await writeFile(specPath, JSON.stringify({ title: "불완전한 요청" }));

		await expect(
			runSpecWorkflow({ specPath, outputPath, officeQa: false }, { assetRoot: resolve("assets") }),
		).rejects.toThrow();
		await expect(readFile(outputPath)).rejects.toBeDefined();
	});

	test.each([
		{ name: "missing", content: undefined, message: "명세 파일을 읽을 수 없습니다" },
		{ name: "malformed", content: "{ invalid", message: "명세 파일이 유효한 JSON이 아닙니다" },
	] as const)("returns a Korean spec error for a $name input", async ({ content, message }) => {
		const directory = await root();
		const specPath = join(directory, "input.json");
		const outputPath = join(directory, "input.pptx");
		if (content !== undefined) await writeFile(specPath, content);

		try {
			await runSpecWorkflow({ specPath, outputPath, officeQa: false }, { assetRoot: resolve("assets") });
			throw new Error("expected spec input failure");
		} catch (error) {
			expect(error).toMatchObject({ code: "KCH-E-SPEC-001" });
			expect(error).toHaveProperty("message", message);
		}
		await expect(readFile(outputPath)).rejects.toBeDefined();
	});

	test.each([
		{
			name: "AI-driven image action",
			visual: { type: "text" },
			imageIntent: { action: "generate", query: "풍력 발전단지", nativeFallback: "text" },
		},
		{
			name: "image visual",
			visual: { type: "image" },
			imageIntent: { action: "none", nativeFallback: "text" },
		},
	] as const)("rejects unsupported $name instead of silently ignoring it", async ({ visual, imageIntent }) => {
		const directory = await root();
		const specPath = join(directory, "unsupported.json");
		const outputPath = join(directory, "unsupported.pptx");
		await writeFile(
			specPath,
			JSON.stringify({
				title: "지원 범위",
				purpose: "지원하지 않는 이미지 계약 확인",
				audience: "KCH 임직원",
				mode: "corporate",
				slides: [
					{
						id: "unsupported",
						purpose: "지원 범위 확인",
						claim: "지원하지 않는 요청은 거부합니다.",
						title: "지원 범위",
						bodyBlocks: [{ text: "이미지 없이 네이티브 개체로 구성합니다." }],
						visual,
						imageIntent,
						usePanorama: false,
					},
				],
			}),
		);

		await expect(
			runSpecWorkflow({ specPath, outputPath, officeQa: false }, { assetRoot: resolve("assets") }),
		).rejects.toThrow("대화형 생성에서는");
		await expect(readFile(outputPath)).rejects.toBeDefined();
	});

	test("honors table diagram and text visuals without duplicating body content", async () => {
		const directory = await root();
		const specPath = join(directory, "visuals.json");
		const outputPath = join(directory, "visuals.pptx");
		const base = {
			purpose: "시각 표현 검증",
			claim: "검증된 정보만 전달합니다.",
			imageIntent: { action: "none", nativeFallback: "text" },
			usePanorama: false,
		};
		await writeFile(
			specPath,
			JSON.stringify({
				title: "시각 표현",
				purpose: "네이티브 시각 요소 확인",
				audience: "KCH 임직원",
				mode: "corporate",
				slides: [
					{
						...base,
						id: "table",
						title: "사업 비교",
						bodyBlocks: [],
						visual: {
							type: "table",
							sourceData: [
								{ label: "사업 A", value: "검토" },
								{ label: "사업 B", value: "실행" },
							],
						},
					},
					{
						...base,
						id: "diagram",
						title: "조직 연결",
						bodyBlocks: [],
						visual: {
							type: "diagram",
							sourceData: [
								{ label: "사업", value: "기획" },
								{ label: "재무", value: "검토" },
							],
						},
					},
					{
						...base,
						id: "diagram-no-data",
						title: "본문 중심",
						bodyBlocks: [{ title: "핵심", text: "중복되면 안 되는 본문" }],
						visual: { type: "diagram" },
					},
					{
						...base,
						id: "text",
						title: "메시지",
						bodyBlocks: [{ text: "한 번만 표시할 메시지" }],
						visual: { type: "text" },
					},
				],
			}),
		);

		await runSpecWorkflow({ specPath, outputPath, officeQa: false }, { assetRoot: resolve("assets") });

		const archive = await JSZip.loadAsync(await readFile(outputPath));
		const table = (await archive.file("ppt/slides/slide1.xml")?.async("string")) ?? "";
		const diagram = (await archive.file("ppt/slides/slide2.xml")?.async("string")) ?? "";
		const noData = (await archive.file("ppt/slides/slide3.xml")?.async("string")) ?? "";
		const text = (await archive.file("ppt/slides/slide4.xml")?.async("string")) ?? "";
		expect(table).toContain("<a:tbl>");
		expect(diagram).toContain("KCH-diagram-node-1");
		expect(occurrences(noData, "중복되면 안 되는 본문")).toBe(1);
		expect(occurrences(text, "한 번만 표시할 메시지")).toBe(1);
	});
});
