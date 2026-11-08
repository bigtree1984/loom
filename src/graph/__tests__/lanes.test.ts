import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../normalizeDocument";
import { moveLane, moveNodeToCell, setLaneWidth, swapColumns, removeColumn } from "../gridEdits";
import { laneIndexByNode } from "../lanes";
import type { LoomDocument, LoomDocumentInput } from "../../types";

const base = normalizeLoomDocument({
  version: 2,
  architecture: {
    columns: [
      { id: "A", label: "A" },
      { id: "B", label: "B" },
      { id: "C", label: "C" },
    ],
    nodes: [
      { id: "a1", label: "a1", type: "backend", col: 0, row: 0 },
      { id: "a2", label: "a2", type: "backend", col: 0, row: 1 },
      { id: "b1", label: "b1", type: "backend", col: 1, row: 0 },
      { id: "c1", label: "c1", type: "backend", col: 2, row: 0 },
    ],
    edges: [],
  },
  flow: { tasks: [], connections: [] },
} as LoomDocumentInput);
const cell = (d: LoomDocument, id: string) => {
  const n = d.architecture.nodes.find((x) => x.id === id)!;
  return [n.col, n.row];
};
// Edits go through normalize, as loadDocument does.
const reload = (d: LoomDocument) => normalizeLoomDocument(d);

describe("2D lanes (DESIGN_v2 §13)", () => {
  it("a one-tier, 1-wide document is unchanged", () => {
    expect(base.architecture.split).toBeUndefined();
    expect(cell(base, "c1")).toEqual([2, 0]);
  });
  it("moving a lane to the bottom tier puts it left-aligned under the top tier", () => {
    const d = reload(moveLane(base, "C", 1, 0));
    expect(d.architecture.split).toBe(2); // top rows 0-1, bottom right below
    expect(cell(d, "c1")).toEqual([0, 2]);
    expect(cell(d, "b1")).toEqual([1, 0]);
    expect(laneIndexByNode(d.architecture).get("c1")).toBe(2);
  });
  it("the bottom tier follows the top tier's height, with no gap row", () => {
    let d = reload(moveLane(base, "C", 1, 0));
    // a2 dropped into the bottom tier (lane C, under c1): the top shrinks to one row.
    d = reload(moveNodeToCell(d, "a2", 0, 3));
    expect(d.architecture.split).toBe(1);
    expect(cell(d, "c1")).toEqual([0, 1]);
    expect(cell(d, "a2")).toEqual([0, 2]);
  });
  it("a 2-wide lane pushes the next lanes right; narrowing folds and pushes down", () => {
    let d = reload(setLaneWidth(base, "A", 2));
    expect(cell(d, "b1")).toEqual([2, 0]);
    d = reload(moveNodeToCell(d, "a2", 1, 0));
    expect(cell(d, "a2")).toEqual([1, 0]);
    d = reload(setLaneWidth(d, "A", 1));
    expect(cell(d, "a1")).toEqual([0, 0]);
    expect(cell(d, "a2")).toEqual([0, 1]);
    expect(cell(d, "b1")).toEqual([1, 0]);
  });
  it("swapping stays within a tier; a lane can be removed once empty", () => {
    let d = reload(moveLane(base, "C", 1, 0));
    d = reload(swapColumns(d, 0)); // A <-> B (C is in the other tier)
    expect(cell(d, "b1")).toEqual([0, 0]);
    expect(cell(d, "a1")).toEqual([1, 0]);
    expect(removeColumn(d, "C")).toBeNull();
  });
  it("tiers survive a save / reload", () => {
    const d = reload(moveLane(base, "C", 1, 0));
    const again = normalizeLoomDocument(JSON.parse(JSON.stringify(d)));
    expect(cell(again, "c1")).toEqual([0, 2]);
    expect(again.architecture.columns.find((c) => c.id === "C")?.tier).toBe("bottom");
  });
});
