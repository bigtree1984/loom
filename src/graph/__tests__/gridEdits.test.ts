import { describe, expect, it } from "vitest";
import { addColumn, moveNodeToCell, removeColumn, swapColumns } from "../gridEdits";
import { normalizeLoomDocument } from "../normalizeDocument";

const base = () =>
  normalizeLoomDocument({
    architecture: {
      columns: [{ id: "A", label: "A" }, { id: "B", label: "B" }],
      nodes: [
        { id: "a", label: "a", type: "agent", col: 0, row: 0 },
        { id: "b", label: "b", type: "agent", col: 1, row: 0 },
        { id: "c", label: "c", type: "agent", col: 1, row: 1 },
      ],
    },
  });
const cell = (doc: ReturnType<typeof base>, id: string) => {
  const n = doc.architecture.nodes.find((x) => x.id === id)!;
  return [n.col, n.row];
};

describe("gridEdits", () => {
  it("swapColumns moves headers and nodes together", () => {
    const d = swapColumns(base(), 0);
    expect(d.architecture.columns.map((c) => c.id)).toEqual(["B", "A"]);
    expect(cell(d, "a")).toEqual([1, 0]);
    expect(cell(d, "b")).toEqual([0, 0]);
  });
  it("moveNodeToCell into an empty cell", () => {
    expect(cell(moveNodeToCell(base(), "a", 0, 3), "a")).toEqual([0, 3]);
  });
  it("moveNodeToCell onto an occupied cell swaps the two", () => {
    const d = moveNodeToCell(base(), "a", 1, 1);
    expect(cell(d, "a")).toEqual([1, 1]);
    expect(cell(d, "c")).toEqual([0, 0]);
  });
  it("addColumn appends at the right", () => {
    expect(addColumn(base(), { id: "C", label: "C" }).architecture.columns.map((c) => c.id)).toEqual(["A", "B", "C"]);
  });
  it("removeColumn refuses a non-empty column and shifts later columns left", () => {
    expect(removeColumn(base(), "A")).toBeNull();
    const withEmpty = addColumn(base(), { id: "C", label: "C" });
    const swapped = swapColumns(withEmpty, 1); // C moves to index 1, B (with nodes) to 2
    const d = removeColumn(swapped, "C")!;
    expect(d.architecture.columns.map((c) => c.id)).toEqual(["A", "B"]);
    expect(cell(d, "b")).toEqual([1, 0]);
  });
});
