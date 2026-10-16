import { describe, expect, it } from "vitest";
import { addEdge, moveColumn, removeEdgeAt, reverseEdgeAt } from "../gridEdits";
import { normalizeLoomDocument } from "../normalizeDocument";

const base = () =>
  normalizeLoomDocument({
    architecture: {
      columns: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }],
      nodes: [
        { id: "a", label: "a", type: "agent", col: 0, row: 0 },
        { id: "b", label: "b", type: "agent", col: 1, row: 0 },
        { id: "c", label: "c", type: "agent", col: 2, row: 0 },
      ],
      edges: [{ from: "a", to: "b" }],
    },
  });
const cols = (d: ReturnType<typeof base>) => d.architecture.columns.map((c) => c.id);
const colOf = (d: ReturnType<typeof base>, id: string) => d.architecture.nodes.find((n) => n.id === id)!.col;

describe("moveColumn", () => {
  it("moves a column right past several others, nodes following", () => {
    const d = moveColumn(base(), 0, 2);
    expect(cols(d)).toEqual(["B", "C", "A"]);
    expect([colOf(d, "a"), colOf(d, "b"), colOf(d, "c")]).toEqual([2, 0, 1]);
  });
  it("moves a column left", () => {
    const d = moveColumn(base(), 2, 0);
    expect(cols(d)).toEqual(["C", "A", "B"]);
    expect(colOf(d, "c")).toBe(0);
  });
  it("same index is a no-op", () => {
    const d0 = base();
    expect(moveColumn(d0, 1, 1)).toBe(d0);
  });
});

describe("edge edits", () => {
  it("adds a directed edge, ignoring duplicates and self-loops", () => {
    const d = addEdge(base(), "b", "c");
    expect(d.architecture.edges).toContainEqual({ from: "b", to: "c" });
    expect(addEdge(d, "b", "c").architecture.edges).toHaveLength(2);
    expect(addEdge(d, "c", "c").architecture.edges).toHaveLength(2);
  });
  it("drawing the reverse of an existing edge makes it two-way", () => {
    const d = addEdge(base(), "b", "a");
    expect(d.architecture.edges).toEqual([{ from: "a", to: "b", bidirectional: true }]);
  });
  it("removes and reverses by index", () => {
    expect(removeEdgeAt(base(), 0).architecture.edges).toEqual([]);
    expect(reverseEdgeAt(base(), 0).architecture.edges).toEqual([{ from: "b", to: "a" }]);
  });
});
