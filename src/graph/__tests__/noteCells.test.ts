import { describe, expect, it } from "vitest";
import { moveNodeToNoteCell, noteCells, noteColumnCount, resetNoteCells } from "../noteCells";
import { normalizeLoomDocument } from "../normalizeDocument";
import type { LoomDocument } from "../../types";

const doc7 = (layout: "grid" | "hex" = "grid"): LoomDocument =>
  normalizeLoomDocument({
    architecture: {
      layout,
      nodes: Array.from({ length: 7 }, (_, i) => ({ id: `n${i}`, label: `N${i}`, type: "agent" as const, col: i, row: i % 2 })),
    },
  });

const allDistinct = (m: Map<string, { col: number; row: number }>) =>
  new Set([...m.values()].map((c) => `${c.col},${c.row}`)).size === m.size;

describe("noteCells", () => {
  it("canvas is 4 wide for grid, 3 for hex", () => {
    expect(noteColumnCount("grid")).toBe(4);
    expect(noteColumnCount("hex")).toBe(3);
  });

  it.each(["grid", "hex"] as const)("derives a complete, in-bounds, overlap-free placement (%s)", (layout) => {
    const d = doc7(layout);
    const m = noteCells(d.architecture);
    expect(m.size).toBe(7);
    expect(allDistinct(m)).toBe(true);
    [...m.values()].forEach((c) => expect(c.col).toBeLessThan(noteColumnCount(layout)));
  });

  it("wraps screen columns into bands, second band below the first", () => {
    const m = noteCells(doc7("grid").architecture);
    expect(m.get("n0")!.col).toBe(0);
    expect(m.get("n3")!.col).toBe(3);
    expect(m.get("n4")!.col).toBe(0);
    expect(m.get("n4")!.row).toBeGreaterThan(Math.max(m.get("n0")!.row, m.get("n1")!.row));
  });

  it("explicit note cells win and never affect the screen cells", () => {
    const d = doc7();
    const moved = moveNodeToNoteCell(d, "n6", 0, 0);
    const m = noteCells(moved.architecture);
    expect(m.get("n6")).toEqual({ col: 0, row: 0 });
    expect(allDistinct(m)).toBe(true);
    moved.architecture.nodes.forEach((n, i) => {
      expect(n.col).toBe(d.architecture.nodes[i].col);
      expect(n.row).toBe(d.architecture.nodes[i].row);
    });
  });

  it("moving onto a taken note cell trades places", () => {
    const d = doc7();
    const before = noteCells(d.architecture);
    const target = before.get("n1")!;
    const after = noteCells(moveNodeToNoteCell(d, "n0", target.col, target.row).architecture);
    expect(after.get("n0")).toEqual(target);
    expect(after.get("n1")).toEqual(before.get("n0"));
  });

  it("clamps drops past the canvas edge", () => {
    const m = noteCells(moveNodeToNoteCell(doc7(), "n0", 9, 0).architecture);
    expect(m.get("n0")!.col).toBe(3);
  });

  it("survives normalize and can be reset", () => {
    const moved = moveNodeToNoteCell(doc7(), "n2", 1, 5);
    const again = normalizeLoomDocument(moved);
    expect(again.architecture.nodes.find((n) => n.id === "n2")).toMatchObject({ noteCol: 1 });
    expect(resetNoteCells(again).architecture.nodes.some((n) => n.noteCol !== undefined)).toBe(false);
  });

  it("hex trims leading rows by an even amount only", () => {
    const d = normalizeLoomDocument({
      architecture: { layout: "hex", nodes: [{ id: "a", label: "A", type: "agent", col: 0, row: 0, noteCol: 0, noteRow: 3 }] },
    });
    const moved = moveNodeToNoteCell(d, "a", 0, 3);
    expect(moved.architecture.nodes[0].noteRow! % 2).toBe(1); // still an odd (offset) row
  });
});
