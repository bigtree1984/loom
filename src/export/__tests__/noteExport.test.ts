import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../../graph/normalizeDocument";
import type { LoomDocument, LoomDocumentInput } from "../../types";
import { noteCellAt, noteCellCenter, noteGeometry } from "../noteLayout";
import { FONT_1, MAX_CHARS_PER_LINE, NODE_FONT } from "../noteSpec";
import { moveNodeToNoteCell } from "../../graph/noteCells";
import { renderNoteFigure } from "../renderNoteSvg";
import { stepOrder } from "../stepOrder";
import { textEm, wrapText } from "../textWrap";

describe("wrapText", () => {
  it("keeps short text on one line", () => {
    expect(wrapText("投稿受付", { maxEm: 4, maxLines: 2 })).toEqual(["投稿受付"]);
  });
  it("wraps Japanese by character and ellipsizes past maxLines", () => {
    const out = wrapText("あいうえおかきくけこさしすせそ", { maxEm: 5, maxLines: 2 });
    expect(out).toEqual(["あいうえお", "かきくけ…"]);
    out.forEach((l) => expect(textEm(l)).toBeLessThanOrEqual(5));
  });
  it("never exceeds 28 characters per line even when the box is wider", () => {
    const out = wrapText("あ".repeat(70), { maxEm: 100, maxLines: 4 });
    expect(out.length).toBe(3);
    out.forEach((l) => expect([...l].length).toBeLessThanOrEqual(MAX_CHARS_PER_LINE));
  });
  it("keeps Latin words whole and honors explicit newlines", () => {
    expect(wrapText("Cloud Storage bucket", { maxEm: 6, maxLines: 3 })).toEqual(["Cloud", "Storage", "bucket"]);
    expect(wrapText("S3\nバケット", { maxEm: 8, maxLines: 2 })).toEqual(["S3", "バケット"]);
  });
});

describe("wrapText keeps Latin words together", () => {
  // 202.5px label box at 38px = the grid node of a 4-column note canvas.
  const box = { maxEm: noteGeometry("grid", 4).textW / NODE_FONT, maxLines: 2 };
  it("does not split CloudFront / DynamoDB mid-word", () => {
    expect(wrapText("CloudFront", box)).toEqual(["CloudFront"]);
    expect(wrapText("DynamoDB テーブル", box)).toEqual(["DynamoDB", "テーブル"]);
    expect(wrapText("Amazon CloudFront", box)).toEqual(["Amazon", "CloudFront"]);
  });
  it("moves a word that does not fit the rest of the line to the next line", () => {
    expect(wrapText("画像をCloudFront", box)).toEqual(["画像を", "CloudFront"]);
  });
  it("breaks a single word only when it is wider than a line, ellipsizing the last line", () => {
    const out = wrapText("ApplicationLoadBalancerControllerService", box);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith("…")).toBe(true);
    out.forEach((l) => expect(textEm(l)).toBeLessThanOrEqual(box.maxEm + 1e-6));
  });
});

describe("note canvas geometry", () => {
  it("is 4 grid / 3 hex columns filling the 1144px content width", () => {
    expect(noteGeometry("grid", 4).pitchX * 4).toBeCloseTo(1144);
    expect(noteGeometry("hex", 3).pitchX * 3.5).toBeCloseTo(1144);
  });
  it.each(["grid", "hex"] as const)("%s: noteCellAt inverts noteCellCenter", (layout) => {
    const g = noteGeometry(layout, layout === "hex" ? 3 : 4);
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < g.cols; col++) {
        const p = noteCellCenter(g, { col, row }, 300);
        expect(noteCellAt(g, p.x + 10, p.y - 10, 300)).toEqual({ col, row });
      }
  });
});

describe("renderNoteFigure lane legend (no column headers)", () => {
  const doc: LoomDocument = normalizeLoomDocument({
    architecture: {
      columns: Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, label: `LANE${i}` })),
      nodes: Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `Node${i}`, type: "backend", col: i, row: 0 })),
      edges: [{ from: "n0", to: "n6" }],
    },
    flow: { tasks: [], connections: [] },
  });
  it("names each used lane once (legend), tints cells, warns about nothing", () => {
    const fig = renderNoteFigure({ doc, orderedTasks: [] });
    for (let i = 0; i < 7; i++) expect(fig.svg.match(new RegExp(`>LANE${i}<`, "g"))?.length).toBe(1);
    // one tile per node; 7 lanes get 7 distinct tints (8-colour palette)
    const tints = [...fig.svg.matchAll(/rx="24" fill="(#[0-9A-F]{6})"/g)].map((m) => m[1]);
    expect(tints).toHaveLength(7);
    expect(new Set(tints).size).toBe(7);
    expect(fig.warnings).toEqual([]);
    expect(fig.svg).toMatch(/font-size="38"/);
  });
  it("places nodes by note cell, and a note move never touches col/row", () => {
    const moved = moveNodeToNoteCell(doc, "n6", 0, 3);
    expect(moved.architecture.nodes.map((n) => [n.col, n.row])).toEqual(doc.architecture.nodes.map((n) => [n.col, n.row]));
    const fig = renderNoteFigure({ doc: moved, orderedTasks: [] });
    const g = fig.diagram.geometry;
    const c = noteCellCenter(g, { col: 0, row: 3 }, fig.diagram.top);
    expect(fig.svg).toContain(`x="${Math.round((c.x - g.nodeW / 2) * 10) / 10}" y="${Math.round((c.y - g.nodeH / 2) * 10) / 10}"`);
    expect(fig.diagram.height).toBeCloseTo(4 * g.pitchY);
  });
  it("omits legend and tints when everything is in one lane", () => {
    const one = normalizeLoomDocument({
      architecture: { nodes: [{ id: "a", label: "A", type: "agent", col: 0, row: 0 }, { id: "b", label: "B", type: "agent", col: 0, row: 1 }] },
    });
    expect(renderNoteFigure({ doc: one, orderedTasks: [] }).svg).not.toMatch(/rx="24" fill="#/);
  });
});

const flowDoc = (tasks: string[], conns: Array<[string, string]>): LoomDocument["flow"] => ({
  tasks: tasks.map((id) => ({ id, label: id, description: "", mainNode: "n", inputNodes: [], outputNodes: [] })),
  connections: conns.map(([from, to]) => ({ from, to })),
});

describe("stepOrder", () => {
  it("orders by rank, ignores loop-backs, and is stable for forks", () => {
    // a -> {c, b} (fork, b listed after c in tasks) -> d, d -> c loop-back
    const flow = flowDoc(["d", "c", "a", "b"], [
      ["a", "c"],
      ["a", "b"],
      ["c", "d"],
      ["b", "d"],
      ["d", "c"],
    ]);
    expect(stepOrder(flow).map((t) => t.id)).toEqual(["a", "c", "b", "d"]);
  });
});

describe("renderNoteFigure on bundled samples", () => {
  const root = path.resolve(__dirname, "../../..");
  const files = ["samples", "src/sample-data"].flatMap((d) =>
    fs.readdirSync(path.join(root, d)).filter((f) => f.endsWith(".json")).map((f) => path.join(root, d, f)),
  );
  it.each(files)("%s: 1240px, node labels 38px, all other text >= 44px", (file) => {
    const doc = normalizeLoomDocument(JSON.parse(fs.readFileSync(file, "utf-8")) as LoomDocumentInput);
    const ordered = stepOrder(doc.flow);
    const fig = renderNoteFigure({ doc, orderedTasks: ordered, stepTasks: ordered.slice(0, 1), stepLabel: "STEP 1" });
    expect(fig.width).toBe(1240);
    const sizes = [...fig.svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBe(NODE_FONT);
    expect(Math.min(...sizes.filter((s) => s !== NODE_FONT))).toBeGreaterThanOrEqual(FONT_1);
    const widths = [...fig.svg.matchAll(/stroke-width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(6);
    expect(fig.svg).not.toMatch(/var\(--/);
  });
});

it("draws an edge between vertically stacked neighbours in the note grid", () => {
  const doc = normalizeLoomDocument({
    architecture: {
      layout: "grid",
      nodes: [
        { id: "a", label: "公開ストレージ", type: "backend", col: 0, row: 0, noteCol: 3, noteRow: 0 },
        { id: "b", label: "通知サービス", type: "backend", col: 0, row: 1, noteCol: 3, noteRow: 1 },
      ],
      edges: [{ from: "a", to: "b" }],
    },
  });
  const { svg } = renderNoteFigure({ doc, orderedTasks: [] });
  expect((svg.match(/<line /g) ?? []).length).toBeGreaterThanOrEqual(1);
});
