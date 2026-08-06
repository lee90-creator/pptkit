# Editable Visual Vocabulary — Deterministic Layouts & Render Contract

Author: `editable-visuals` (team kch-ppt-research)
Evidence: both contact sheets, exact COM profiles (`ppt-profiles/*.profile.json`), 6 full-res slide probes, `wave-1-renderer-engines.md`, `wave-1-brand-assets.md`, local `logo/` + `font/` inventory.
Target engine: TypeScript + PptxGenJS, native shapes/connectors only (per wave-1 renderer verdict). Optional PowerPoint COM = QA/render adapter, never a generator.

---

## 0. Canvas, tokens, and the two header grammars

All coordinates in **points**, canvas fixed **960 × 540** (both reference decks are exactly this; measured via COM profile `slideWidth/Height`).

```ts
type Pt = number; // points on a 960x540 canvas
interface Box { x: Pt; y: Pt; w: Pt; h: Pt }
```

### 0.1 Design tokens (measured, not invented)

```ts
const TOKENS = {
  color: {
    brand:      "1972DA", // KCH primary blue (18 fills in kch deck)
    navy:       "1E3A5F", // shinan structural navy; kch uses 203864 for text
    navyText:   "203864",
    cyan:       "00B0F0", // shinan accent
    cyanSoft:   "47AADF",
    inkText:    "000000",
    subText:    "595959",
    mutedText:  "7F7F7F",
    panel:      "F2F2F2",
    panelBlue:  "DAE3F3", // kch label chips
    panelSky:   "DEEBF7",
    hairline:   "D0CECE",
    white:      "FFFFFF",
    chartRamp:  ["4472C4","2E75B6","1F4E79","1F4E79","000000"], // 5-bar KPI ramp, final bar black (slide kch-4)
    warnRed:    "C00000",  // sparse emphasis only (red text inside sentences)
    okGreen:    "375623",  // shinan green sub-track
    orange:     "C55A11",  // shinan orange sub-track
  },
  font: {
    display: "Pretendard Black",     // replaces Tmon몬소리 Black (24pt section titles, 54-66pt cover/QA)
    heading: "Pretendard ExtraBold", // replaces 나눔스퀘어_ac ExtraBold / 210옴니고딕 050
    body:    "Pretendard Regular",   // replaces 나눔스퀘어_ac / 210옴니고딕 030
    bodyBold:"Pretendard Bold",
    num:     "Inter",                // Latin/tabular numerals in KPI + charts
  },
  size: { pageTitle: 24, blockTitle: 18, cardTitle: 16, body: 14, caption: 12, micro: 10.5, kpi: 28, cover: 54 },
  radius: { card: 8, chip: 4 },
  gutter: 12, margin: { l: 66, r: 66, t: 28, contentTop: 96, footB: 24 },
} as const;
```

**LAW-1 (fonts):** Reference decks use unlicensed/absent fonts (Tmon몬소리, 나눔스퀘어, 210 옴니고딕, Mont). Generator MUST emit only Pretendard (9 weights, OFL-verified) + Inter. Weight mapping above is the deterministic substitution table; no runtime font probing.

### 0.2 Header grammar (two chromes, one contract)

```ts
type Chrome = "kchGroup" | "kchWide";
```

- **`kchGroup`** (KCH 소개자료 body): left blue vertical accent bar (x≈78, w≈24, gradient brand→white), ghost section number 01–04 (Pretendard Black, ~66pt, 8% black, x≈120), page title 24pt at **(156, 27.8, 161+, 36.4)** measured; breadcrumb text 16pt right-aligned at **(581, 28.3, 225, 26.7)**; logo `KCH_LOGOV2.png` at **(818, 23, 111, 33.9)**; top-right brand block (thin #1972DA strip, right edge); hairline rule y≈68 from x=50→910; page number 14pt bottom-right (930, 505).
- **`kchWide`** (신안 report body): logo `KCH_LOGOV2.png` at **(24, 19, 82, 38.3)** + "GROUP" 18pt mutedText at (108, 33); centered title 26pt navy at **(364, 23.3, 480, 38.8)**, thin navy rule under title from x=352→958 at y≈62; optional bottom panorama band (see §5 raster rules) height ≤ 90pt anchored y≥450 behind content; page number bottom-left (18, 505).

Every body archetype composes `chrome + titleBlock + contentBox` where `contentBox = {x:50, y:96, w:860, h:396}` (kchGroup) or `{x:40, y:80, w:880, h:420}` (kchWide). Sub-section label = "flag" motif: 4×18pt brand rectangle + 18pt Pretendard ExtraBold text (kch) or left blue tick + 17pt navy (shinan). Deterministic: one flag per content block, flush to block top-left.

---

## 1. Archetype catalogue (typed)

```ts
type Slide =
  | Cover | TOC | SectionDivider | KpiDashboard | ComparisonCards | HubSpoke
  | OrgChart | ProcessFlow | Timeline | MiniGantt | SpecTable | DataTable
  | MatrixHeatmap | MapCallouts | PhotoEvidence | ImageLed | StrategyCards
  | FinanceDashboard | Closing;

interface Base { chrome: Chrome; title: string; breadcrumb?: string; pageNo: number; sectionNo?: 1|2|3|4|5|6|7|8|9|10 }
```

### 1.1 `Cover`
```ts
interface Cover { kind:"cover"; variant:"photoCard"|"fullBleed";
  title: string; subtitle?: string; org: string; date: string; image: ImageRef }
```
- `photoCard` (kch-1): full-bleed photo inset 9.8pt on all sides (white frame), bottom 50% overlaid with 50%-transparent light band (measured Rectangle rot=180 fill DAE3F3-family at y=267.6 h=272.4), white title card centered-left with brand left bar, title 54pt display, date 18pt.
- `fullBleed` (shinan-1): photo right-anchored, white gradient left panel, red corner chip (対外비 badge, 12pt white on C00000), title 32pt navy top-left stack, org/date 20–24pt below, "TF팀" tag bottom-right.
- Algorithm: title box `x=60,y=200` grows downward; if title wraps >2 lines at 54pt → step down 6pt until ≤2 lines (floor 40pt). Deterministic autofit, no PowerPoint autosize.

### 1.2 `TOC`
```ts
interface TOC { kind:"toc"; image?: ImageRef; items: { no:string; label:string }[] } // 3..10 items
```
- kch-2 style when `image` present: left half photo card (rounded 8pt), right column of number chips: brand rounded-square 40×40 with two-digit "01." white 18pt + label 18–24pt heading; row pitch = `min(64, (contentH-24)/n)`.
- shinan-2 style (no image): two balanced columns under centered rule; `col = i < ceil(n/2) ? 0 : 1`; row pitch `min(52, contentH/ceil(n/2))`; items numbered `1.`–`10.` body 18pt.
- Overflow: n>10 → forbidden (schema max); n>6 with image → drop image, switch to two-column.

### 1.3 `SectionDivider` — ghost-number interstitial (implied by kch 01–04 numbering; optional archetype for generated decks): brand canvas 40% left panel, giant number 120pt at 10% white, section title 32pt.

### 1.4 `KpiDashboard` (kch-4)
```ts
interface Kpi { label:string; value:string; series?: { cat:string; v:number }[] } // 4-6 pt series
interface KpiDashboard { kind:"kpiDashboard"; leftBlocks: { chip:string; body:string }[]; kpis: Kpi[] } // kpis: 2|4
```
- Layout: left column 46% = stacked chip rows (chip = panelBlue rounded 4pt, heading 18pt centered, body 14pt below, pitch = contentH / blocks). Right 54% = 2×2 KPI grid; each cell: label 18pt + value 24pt heading, then **native bar chart** (PptxGenJS `addChart(BAR)`), color ramp `chartRamp` with final bar black, data labels on, no axes/gridlines, category labels ’21-’25 12pt.
- Overflow: leftBlocks max 6; body text > 3 lines at 14pt → truncate at sentence boundary and RAISE (generator error, never silent shrink below 12pt).

### 1.5 `ComparisonCards` (kch-8, kch-10, kch-11, shinan-5)
```ts
interface CompareCol { header:string; accent?: "brand"|"navy"|"grey"; rows: string[] }
interface ComparisonCards { kind:"comparisonCards"; intro?: string; cols: CompareCol[]; rowLabels?: string[] } // 2..4 cols
```
- Intro banner: full-width grey rounded panel, 16pt centered, inline red/brand emphasis via rich-text runs.
- Columns: equal width `(W - (n-1)*gutter)/n`, header = filled rounded top bar (accent), rows = white cells with hairline dividers; with `rowLabels`, prepend a 18% label spine column (panel fill).
- Overflow: any cell >4 lines at 14pt → step to 12pt once; still >5 lines → generator error.

### 1.6 `HubSpoke` (kch-7)
```ts
interface Spoke { title:string; sub?:string; bullets:string[]; image?:ImageRef }
interface HubSpoke { kind:"hubSpoke"; hubTitle:string; hubLogo?:ImageRef; spokes: Spoke[] } // 4..6 spokes
```
- Hub: circle Ø≈310pt center (480, ~320 content-center), navy 2pt outline, hub title 32pt + logo.
- Spokes: split `ceil(n/2)` left / rest right, vertical pitch `contentH/ceil(n/2)`; each spoke = dashed-outline rounded card 280×(pitch-16) with underlined 18pt title + bullets 14pt; optional 210×(pitch-16) rounded photo outboard of the card. Straight elbow connectors (native `line` with midpoint bends) card-edge → hub-rim; connector endpoints computed from box centers (deterministic, no autolayout).

### 1.7 `OrgChart` (kch-3)
```ts
interface OrgNode { label:string; children?: OrgNode[]; tag?: "highlight"|"dashed" }
interface OrgChart { kind:"orgChart"; root: OrgNode; sideNotes?: { side:"l"|"r"; label:string; items:string[] }[] }
```
- Strict 3-tier layered layout: root chip centered (brand fill, white text) with logo below; tier-2 = evenly spaced across width; tier-3 stacks under each parent (chip 90×26, pitch 32). Connectors: vertical trunk + horizontal bus + drops (9 native lines measured on kch-3 — reproduce exactly this bus topology).
- `highlight` tag = red dashed rounded rect around node group. `sideNotes` = bracketed label columns (‹국내지사› etc.) with arrow chips.
- Overflow: tier-2 max 7; deeper than 3 tiers → generator error (matches reference ceiling).

### 1.8 `ProcessFlow` (kch-14, shinan-6 SPC structure)
```ts
interface FlowNode { id:string; label:string; sub?:string; logo?:ImageRef; accent?:"navy"|"brand"|"grey" }
interface FlowEdge { from:string; to:string; label?:string; dir?: "fwd"|"back" }
interface ProcessFlow { kind:"processFlow"; banner?:string; nodes:FlowNode[]; edges:FlowEdge[];
  grid: { cols:number; rows:number; place: Record<string,[number,number]> }; sideTable?: SpecTableData }
```
- **Author supplies the grid placement** — no auto graph layout ever. Cell size `(W_flow-(cols-1)*24)/cols × (H-(rows-1)*20)/rows`; node = rounded rect 8pt radius, 2pt navy outline, title 16pt bold, logos inline. Edge = straight arrow connector between facing edge midpoints; `label` = 12pt text at midpoint offset 4pt.
- With `sideTable`: flow gets 62% width panel (panel fill F2F2F2 rounded), table 38% right.
- Banner (kch-14): grey rounded strip with rich-text emphasis, above the flow.

### 1.9 `Timeline` — serpentine milestone flow (shinan-12)
```ts
interface Milestone { date:string; label:string; state:"done"|"active"|"future" }
interface SubTrack { title:string; accent:"green"|"orange"; milestones:{date:string;label:string}[] }
interface Timeline { kind:"timeline"; milestones: Milestone[]; subTracks?: SubTrack[] } // 6..12 milestones
```
- Serpentine: row capacity `k = ceil(n/2)`; row1 left→right at y1, U-turn arc right edge (two quarter-arc native `blockArc`/`moc` shapes joined, stroke 18pt cyan), row2 right→left, arrowhead terminal. Node = donut circle Ø34 (white ring, fill grey=future/cyan=done/navy=active), date 16pt bold above, label card 12pt below with cyan top rule.
- SubTracks: tinted rounded panels (green E2EFDA / orange FBE5D6) above/below the main band, internal dashed mini-timeline with open circles.
- Overflow: n>12 → error; label >2 lines at 12pt → error (timeline text must stay atomic).

### 1.10 `MiniGantt` / `MatrixHeatmap` (shinan-20 twin tables, kch-15 milestone list)
```ts
interface MatrixHeatmap { kind:"matrixHeatmap"; blocks: { flag:string; cols:string[]; rows:{ label:string;
  cells:{ text?:string; fill?:string; span?:number }[] }[] }[] } // 1..2 blocks
```
- Rendered as **native tables** (PptxGenJS `addTable`) with per-cell fills — the year-grid Gantt and yellow assignment matrix are just tables with merged spans and a 4-step blue ramp / FFFF00 chips. Header row: 595959 fill, white 12pt. Col widths: label col 96pt, remaining equal. Cell text ≥8pt floor (measured 8pt in reference), never below.
- kch-15 variant (`checklist`): 2-col table (date chip col + description) + right thumbnail rail of doc images.

### 1.11 `SpecTable` / `DataTable` (kch-14 right, shinan-9, shinan-14..18, shinan-21)
```ts
interface SpecTableData { header?: [string,string]; rows: [string,string][] }      // 항목/내용 2-col
interface DataTable { kind:"dataTable"; flag?:string; cols:{label:string;w?:Pt}[];
  rows:string[][]; zebra?:boolean; note?:string; scale?: "auto" }                  // appendix grade
```
- SpecTable: navy header band, label col 28% panel fill, row height = `min(56, H/rows)`, 14pt.
- DataTable: appendix density profile — 9–12pt body, header 595959/white, hairline D0CECE grid, zebra F2F2F2; column widths resolved once: fixed `w` honored, rest split evenly. **Overflow law:** rows exceeding contentH at 9pt → split into continuation slide with same title + "(계속)"; never shrink below 8pt, never clip.

### 1.12 `MapCallouts` (shinan-3, shinan-7, shinan-8, kch-8-map)
```ts
interface MapCallouts { kind:"mapCallouts"; image:ImageRef; overlays: (
  { t:"zone"; poly:[Pt,Pt][]; stroke:string; fillPct?:number } |
  { t:"pin"; at:[Pt,Pt]; label:string } |
  { t:"leader"; from:[Pt,Pt]; to:[Pt,Pt]; card:{title:string; lines:string[]} })[];
  legend?: {swatch:string; label:string}[]; sideCard?: SpecTableData }
```
- Base map/aerial = raster (see §5). ALL annotation — zone freeforms (semi-transparent fills, dashed strokes), pins, leader lines, label cards, legend chips — is native and editable, drawn in slide coordinates over the picture.

### 1.13 `PhotoEvidence` (kch-9, kch-12, kch-13, shinan-19)
```ts
interface PhotoEvidence { kind:"photoEvidence"; layout:"hero"|"grid2"|"grid2x2"|"rail";
  photos:{ image:ImageRef; caption?:string; chip?:string }[]; intro?:string; annotations?: MapCallouts["overlays"] }
```
- `hero`: single rounded photo filling contentBox (kch-9 aerial with freeform boundary overlays). `grid2`: two cards with caption chips (panelBlue rounded, 14pt centered) — kch-13. `grid2x2`, `rail` (thumbnail strip under text, kch-12). Photo corner radius 8pt uniform; captions never on the photo (chip above or below) except hero, which allows a white 80% chip bottom-left.

### 1.14 `ImageLed` (kch-6 asset grid, kch-5 dashboard-with-donut)
- kch-6 = `PhotoEvidence.grid` with 3×2 named-asset cards (photo + name chip + one-line spec).
- kch-5 `FinanceDashboard`: left ring/venn motif (3 overlapping native donut/circle shapes + center circle with total), right **native doughnut chart** + rank table; footer KPI strip of 5 numeric chips. Typed as:
```ts
interface FinanceDashboard { kind:"financeDashboard"; venn:{label:string;value:string}[];
  donut:{cat:string;v:number}[]; rankTable:string[][]; kpiStrip:{label:string;value:string}[] }
```

### 1.15 `StrategyCards` (shinan-20 top / shinan-19 3-up)
```ts
interface StrategyCards { kind:"strategyCards"; cards:{ no:string; accent:"green"|"purple"|"navy";
  title:string; kpi?:{label:string;value:string}; bullets:string[] }[] } // 2..4
```
- Equal cards, colored top-band with white number circle, center KPI value 28pt accent color, bullets 12pt, optional footer strip in accent tint.

### 1.16 `Closing` (kch-17 Q&A, shinan-13 감사합니다)
- `qna`: photo-card frame like Cover + brand gradient "Q & A" panel 66pt. `thanks`: bare chrome, single centered line 50pt brand-blue text, bottom panorama band. No other content permitted.

### 1.17 Finance/mixed dashboards (shinan-10, shinan-11)
- shinan-11 = `KpiStrip + area chart`: 5 headline KPI chips (value 28pt colored) over a **native area/line chart** (총매출 curve) + assumption spec table left rail. Typed as `FinanceDashboard` variant `revenue`. shinan-9/kch appendix cost pages = `DataTable`.

---

## 2. Reference coverage matrix (VERIFY)

KCH 소개자료 (17): 1 Cover/photoCard · 2 TOC(image) · 3 OrgChart · 4 KpiDashboard · 5 FinanceDashboard · 6 PhotoEvidence.grid(3×2) · 7 HubSpoke · 8 ComparisonCards+MapCallouts(sideCard) · 9 PhotoEvidence.hero(+zone overlays) · 10 ComparisonCards(2col) · 11 ComparisonCards(2col) · 12 PhotoEvidence.rail · 13 PhotoEvidence.grid2 · 14 ProcessFlow(+SpecTable) · 15 MiniGantt.checklist(+doc rail) · 16 Base(title-only stub) · 17 Closing.qna.

신안 보고 (21): 1 Cover/fullBleed · 2 TOC(2col) · 3 MapCallouts(+SpecTable) · 4 ProcessFlow(policy chips grid) · 5 ComparisonCards(+KPI chips) · 6 ProcessFlow(SPC)+banner · 7 MapCallouts(개발계획 zoning + DataTable) · 8 MapCallouts(입지분석, zones+legend) · 9 DataTable(사업비) · 10 ComparisonCards(임대/분양 2col dense) · 11 FinanceDashboard.revenue(KPI strip+area chart+table) · 12 Timeline.serpentine(+2 SubTracks) · 13 Closing.thanks · 14–17 DataTable(해상풍력 현황, continuation series) · 18 MatrixHeatmap+DataTable · 19 StrategyCards? no → PhotoEvidence+DataTable(토석) · 20 StrategyCards(3-up) · 21 MatrixHeatmap(수요예측 twin gantt-tables).

Every one of the 38 slides maps to ≥1 archetype; no orphan. (Slide numbering per contact-sheet order.)

---

## 3. Deterministic layout engine rules

1. **No autolayout, no measurement feedback loops.** Every archetype computes boxes from `(contentBox, n, gutter)` closed-form. Text fitting uses a pure estimator: `lines = ceil(textWidth(str, font, size) / boxW)` with a bundled per-font advance-width table for Pretendard/Inter (build-time extracted from TTF `hmtx`). Same input → identical geometry, byte-stable XML ordering.
2. **Fallback ladder (uniform):** (a) step body size down exactly one notch (14→12, 12→10.5); (b) archetype-specific structural fallback (drop TOC image, split DataTable to continuation slide, 2×2→2×3 grid); (c) **hard error with slide id + offending field** — never clip, never scale below floors (body 10.5, table 8, timeline 12).
3. **Emphasis runs:** inline `**bold**`, `{red:…}`, `{brand:…}` markers compile to rich-text runs; the only permitted colors are warnRed/brand/navyText.
4. **Z-order contract:** background raster → panels → connectors → cards → text → chips. Fixed emission order guarantees editability (click-through hits text first).
5. **Grouping:** each logical unit (card, spoke, milestone) emitted as a PptxGenJS group where supported so users move units atomically; connectors stay ungrouped at connector layer.

## 4. Chart contract (native, editable)

- Bars/columns, doughnut, pie, area/line: **always `addChart` native** — must remain editable data in PowerPoint (wave-1 EXPAND item; hard QA gate below).
- Fixed chart style: no gridlines, no axis lines except baseline, data labels on (Inter, 12pt), category labels 12pt, ramp colors from `chartRamp`, final/emphasis series black or brand. Legends off; labels do the work (matches kch-4/5, shinan-11).
- Never raster a chart. If a requested chart type is outside PptxGenJS support → generator error listing supported set (no silent image fallback).

## 5. Native-vs-raster boundary (hard law)

**Raster allowed (only):** photos, aerial/satellite maps, GIS zoning base images, logo PNGs, scanned documents, the shinan bottom panorama band, cover art. All supplied as `ImageRef` assets; generator never synthesizes raster.
**Native mandatory:** all text, tables, charts, connectors, chips, timelines, org/flow diagrams, map annotations (zones/pins/leaders/legends), KPI numbers, section chrome, rules, page numbers. SmartArt is banned (Office-specific, per wave-1); its look is reproduced with shapes+connectors.
**Grey zone rule:** if a reference visual mixes both (kch-9 boundary-on-aerial), the photo is raster and every stroke/label on top is native. Existing reference header artwork is **reconstructed from tokens + logo PNGs**, not screenshot-extracted (answers wave-1 EXPAND).

## 6. Binary visual QA checks (per rendered slide, COM/export adapter)

Each check is pass/fail, no scoring:

1. **Q-CANVAS:** exported PNG is 1600×900 and slide master count == 1.
2. **Q-CHROME:** logo present at chrome-specified box ±2pt; title baseline inside title box; hairline rule present at expected y ±1pt. (Shape-model assertion via COM, not pixels.)
3. **Q-FONT:** every run's fontName ∈ {Pretendard*, Inter}; zero fallback fonts reported.
4. **Q-OVERSET:** no text frame reports overflow (COM `TextFrame2.WordWrap` + fit check: rendered text height ≤ frame height).
5. **Q-BOUNDS:** every shape bbox ⊂ [0,960]×[0,540]; content shapes ⊂ contentBox ±4pt except sanctioned bleeds (cover, panorama, divider).
6. **Q-EDIT-CHART:** for each chart, COM can open `Chart.ChartData` workbook and cell A1 reads back the schema's first category (proves editable native chart).
7. **Q-EDIT-TABLE:** shape.HasTable true for every schema table; row/col counts equal schema.
8. **Q-CONNECT:** connector count equals schema edge count; each connector's endpoints within 3pt of computed anchor points.
9. **Q-COLOR:** all solid fills ∈ token palette (∪ per-slide sanctioned image-derived none); any off-palette fill fails.
10. **Q-RASTER-BUDGET:** picture count equals schema `ImageRef` count (no smuggled rasterized text/charts).
11. **Q-PIXEL-DIFF (regression only):** byte-identical schema input → pixel-identical PNG vs golden (determinism proof).
12. **Q-FLOOR:** min fontSize per archetype ≥ floor table (body 10.5 / table 8 / timeline 12).

## 7. Creative leads (RAISE LAW)

- **L1 — one grammar, two skins.** Both decks are the same compositional language wearing different chrome; ship `Chrome` as a 2-value theme, not two template forks. New skins later = new chrome record only.
- **L2 — the black exclamation bar.** kch-4's chart ramp ends in a *black* current-year bar — a strong deterministic emphasis idiom. Adopt globally: "latest/total = black or brand, history = ramp."
- **L3 — serpentine timeline is the signature piece.** shinan-12's U-turn cyan pipe with donut nodes + tinted sub-track panels is the deck's most distinctive visual; it is fully achievable with native arcs/lines and should headline the vocabulary demo.
- **L4 — tables as heatmaps.** shinan-18/21 prove dense Gantt/assignment visuals need no charting: native tables + per-cell fills. Cheap, editable, deterministic — prefer over any chart when data is categorical-temporal.
- **L5 — dashed-outline = "prospective".** References use dashed rounded cards for in-progress/highlighted entities (kch-7 spokes, kch-3 red dashed org highlight). Encode `state: solid|dashed|highlight` as semantics, not styling.
- **Constraint C1:** no SmartArt, no theme-color indirection (explicit hex only) — round-trip safety.
- **Constraint C2:** author-supplied grid placement for flows/orgs; auto graph layout is nondeterministic and banned.
- **Constraint C3:** Mont/Mont Blanc and reference deck fonts must never enter output (license).

## EXPAND

- LEAD: PptxGenJS feasibility probe should specifically exercise: grouped shapes, blockArc/quarter-arc for the serpentine U-turn, per-cell table fills + merges, doughnut with data labels, Korean line-break estimation against the bundled Pretendard advance-width table.
- LEAD: Q-CHECK harness needs the COM adapter from `windows-bootstrap`; confirm COM exposes `TextFrame2` fit signals reliably for overflow detection (Q-OVERSET), else fall back to estimator-only + pixel diff.
- LEAD: decide asset pipeline for maps/aerials (user-supplied vs. stock) — schema treats them as opaque `ImageRef`, but provenance/licensing needs a policy.
- DEAD END: extracting header artwork from the reference decks — reconstruction from tokens + `logo/*.png` is complete and cleaner.

## CLAIMS

- CLAIM: 17 archetypes + 2 chromes cover all 38 reference slides with no orphan (matrix §2) — RISK: normal — PRIMARY: contact sheets + COM shape profiles cross-checked per slide.
- CLAIM: every reference visual except photos/maps/panorama is reproducible as editable native shapes/tables/charts in PptxGenJS — RISK: normal — PRIMARY: profile shape-type census (autoshape/textbox/table/chart/line dominate; zero SmartArt shapes found in either deck).
- CLAIM: closed-form layout + bundled font metrics + fixed emission order yields byte/pixel-deterministic output, gated by Q-PIXEL-DIFF — RISK: normal — PRIMARY: no measurement-feedback step exists in the contract.
- CLAIM: the 12 binary QA checks are machine-decidable via COM shape-model + export, no human judgment required — RISK: normal — PRIMARY: each check maps to a COM property or exact pixel/count comparison.
