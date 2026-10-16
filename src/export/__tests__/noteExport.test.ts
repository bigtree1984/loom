import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../../graph/normalizeDocument";
import type { LoomDocument, LoomDocumentInput } from "../../types";
import { labelCharsPerLine, maxColsPerTier, MIN_LABEL_CHARS, planTiers } from "../noteLayout";
import { FONT_1, MAX_CHARS_PER_LINE } from "../noteSpec";
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

describe("tier planning", () => {
  it("is derived from the 44px / 4-char measurement", () => {
    expect(labelCharsPerLine("grid", maxColsPerTier("grid"))).toBeGreaterThanOrEqual(MIN_LABEL_CHARS);
    expect(labelCharsPerLine("grid", maxColsPerTier("grid") + 1)).toBeLessThan(MIN_LABEL_CHARS);
    expect(maxColsPerTier("grid")).toBe(4);
    expect(maxColsPerTier("hex")).toBe(3);
  });
  it("splits evenly and warns", () => {
    expect(planTiers(4, "grid")).toEqual({ tiers: [[0, 4]], colsPerTier: 4, warning: undefined });
    const six = planTiers(6, "grid");
    expect(six.tiers).toEqual([
      [0, 3],
      [3, 6],
    ]);
    expect(six.warning).toMatch(/2段/);
    expect(planTiers(9, "grid").tiers).toHaveLength(3);
    expect(planTiers(9, "grid").warning).toMatch(/3段/);
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
  it.each(files)("%s: 1240px, no text under 44px", (file) => {
    const doc = normalizeLoomDocument(JSON.parse(fs.readFileSync(file, "utf-8")) as LoomDocumentInput);
    const ordered = stepOrder(doc.flow);
    const fig = renderNoteFigure({ doc, orderedTasks: ordered, stepTasks: ordered.slice(0, 1), stepLabel: "STEP 1" });
    expect(fig.width).toBe(1240);
    const sizes = [...fig.svg.matchAll(/font-size="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(FONT_1);
    const widths = [...fig.svg.matchAll(/stroke-width="(\d+)"/g)].map((m) => Number(m[1]));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(6);
    expect(fig.svg).not.toMatch(/var\(--/);
  });
});
