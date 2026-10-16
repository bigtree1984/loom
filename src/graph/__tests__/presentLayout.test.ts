import { describe, expect, it } from "vitest";
import { compactForPresent, presentColumnMap } from "../presentLayout";
import type { LoomDocument } from "../../types";

const arch = {
  columns: [
    { id: "a", label: "A" },
    { id: "b", label: "B" },
    { id: "c", label: "C" },
    { id: "d", label: "D" },
  ],
  nodes: [
    { id: "n1", label: "1", type: "backend", col: 0, row: 0 },
    { id: "n2", label: "2", type: "backend", col: 2, row: 1 },
    { id: "n3", label: "3", type: "backend", col: 2, row: 0 },
  ],
  edges: [],
} as unknown as LoomDocument["architecture"];

describe("presentLayout", () => {
  it("maps empty columns to null and compacts the rest", () => {
    expect(presentColumnMap(arch)).toEqual([0, null, 1, null]);
  });
  it("drops empty columns and remaps nodes without mutating input", () => {
    const before = JSON.stringify(arch);
    const out = compactForPresent(arch);
    expect(out.columns.map((c) => c.id)).toEqual(["a", "c"]);
    expect(out.nodes.map((n) => n.col)).toEqual([0, 1, 1]);
    expect(JSON.stringify(arch)).toBe(before);
  });
  it("is identity when no column is empty", () => {
    const full = { ...arch, columns: arch.columns.slice(0, 3), nodes: [...arch.nodes, { id: "n4", label: "4", type: "backend", col: 1, row: 0 }] } as typeof arch;
    expect(compactForPresent(full).nodes.map((n) => n.col)).toEqual([0, 2, 2, 1]);
  });
});
