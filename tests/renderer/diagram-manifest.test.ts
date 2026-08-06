import { describe, expect, test } from "bun:test";

import { KCH_TOKENS } from "../../src/design-system/tokens.js";
import { RENDERER_CORPUS_KINDS, contentFrame } from "../../src/renderer/diagrams.js";

const CANVAS = KCH_TOKENS.canvas;

describe("renderer corpus manifest", () => {
	test("exposes the exact seventeen corpus kinds in plan order", () => {
		expect(RENDERER_CORPUS_KINDS).toEqual([
			"cover",
			"toc",
			"section-divider",
			"kpi-dashboard",
			"comparison-cards",
			"strategy-cards",
			"org-chart",
			"specification-table",
			"data-table",
			"matrix-heatmap",
			"financial-dashboard",
			"hub-spoke",
			"image-callout",
			"process",
			"timeline",
			"mini-gantt",
			"closing",
		]);
		expect(new Set(RENDERER_CORPUS_KINDS).size).toBe(17);
	});

	test("content frame stays inside the reference margins", () => {
		const frame = contentFrame();
		expect(frame.x).toBeCloseTo(KCH_TOKENS.content.left, 10);
		expect(frame.y).toBeCloseTo(KCH_TOKENS.content.top, 10);
		expect(frame.x + frame.w).toBeCloseTo(CANVAS.width - KCH_TOKENS.content.right, 10);
		expect(frame.y + frame.h).toBeCloseTo(CANVAS.height - KCH_TOKENS.content.bottom, 10);
	});
});
