import { z } from "zod";

import { AssetIdSchema, NodeIdSchema, StepIdSchema } from "./ids.js";

const CellValueSchema = z.union([z.string(), z.number()]);

export const VisualTypeSchema = z.enum(["chart", "table", "diagram", "process", "timeline", "image", "metric", "text"]);

const SourceDatumSchema = z.object({
	label: z.string().min(1),
	value: z.union([z.number(), z.string().min(1)]),
	unit: z.string().min(1).optional(),
});

export const SemanticVisualIntentSchema = z.object({
	type: VisualTypeSchema,
	sourceData: z.array(SourceDatumSchema).optional(),
	unit: z.string().min(1).optional(),
});

const ChartVisualSchema = z
	.object({
		type: z.literal("chart"),
		chartType: z.enum(["bar", "line", "area", "donut"]),
		categories: z.array(z.string().min(1)).min(1),
		series: z
			.array(
				z
					.object({
						name: z.string().min(1),
						values: z.array(z.number()).min(1),
					})
					.strict(),
			)
			.min(1),
		unit: z.string().min(1).optional(),
	})
	.strict();

const TableVisualSchema = z
	.object({
		type: z.literal("table"),
		columns: z.array(z.string().min(1)).min(1),
		rows: z
			.array(
				z
					.object({
						cells: z.array(CellValueSchema).min(1),
					})
					.strict(),
			)
			.min(1),
		unit: z.string().min(1).optional(),
	})
	.strict();

const DiagramVisualSchema = z
	.object({
		type: z.literal("diagram"),
		nodes: z
			.array(
				z
					.object({
						id: NodeIdSchema,
						label: z.string().min(1),
					})
					.strict(),
			)
			.min(1),
		edges: z.array(
			z
				.object({
					from: NodeIdSchema,
					to: NodeIdSchema,
				})
				.strict(),
		),
	})
	.strict();

const ProcessVisualSchema = z
	.object({
		type: z.literal("process"),
		steps: z
			.array(
				z
					.object({
						id: StepIdSchema,
						label: z.string().min(1),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

const TimelineVisualSchema = z
	.object({
		type: z.literal("timeline"),
		events: z
			.array(
				z
					.object({
						date: z.string().min(1),
						label: z.string().min(1),
					})
					.strict(),
			)
			.min(1),
	})
	.strict();

const ImageVisualSchema = z
	.object({
		type: z.literal("image"),
		assetId: AssetIdSchema,
		alt: z.string().min(1),
	})
	.strict();

const MetricVisualSchema = z
	.object({
		type: z.literal("metric"),
		label: z.string().min(1),
		value: z.number(),
		unit: z.string().min(1).optional(),
	})
	.strict();

const TextVisualSchema = z
	.object({
		type: z.literal("text"),
		text: z.string().min(1),
	})
	.strict();

export const VisualSchema = z
	.discriminatedUnion("type", [
		ChartVisualSchema,
		TableVisualSchema,
		DiagramVisualSchema,
		ProcessVisualSchema,
		TimelineVisualSchema,
		ImageVisualSchema,
		MetricVisualSchema,
		TextVisualSchema,
	])
	.superRefine((visual, context) => {
		if (visual.type === "chart") {
			for (const [index, series] of visual.series.entries()) {
				if (series.values.length !== visual.categories.length) {
					context.addIssue({
						code: "custom",
						message: "차트 계열 값 수는 범주 수와 같아야 합니다.",
						path: ["series", index, "values"],
					});
				}
			}
		}
		if (visual.type === "table") {
			for (const [index, row] of visual.rows.entries()) {
				if (row.cells.length !== visual.columns.length) {
					context.addIssue({
						code: "custom",
						message: "표의 모든 행은 열 수와 같은 셀 수를 가져야 합니다.",
						path: ["rows", index, "cells"],
					});
				}
			}
		}
	});

export const RendererCorpusKindSchema = z.enum([
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

export type Visual = z.infer<typeof VisualSchema>;
export type RendererCorpusKind = z.infer<typeof RendererCorpusKindSchema>;
