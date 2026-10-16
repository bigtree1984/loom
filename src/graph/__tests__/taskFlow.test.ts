import { describe, expect, it } from "vitest";
import { activeEdgeFlow, addIoHighlights, type NodeHighlight } from "../taskFlow";

const task = { id: "t", label: "t", description: "", mainNode: "m", inputNodes: ["i", "x"], outputNodes: ["o", "x"] };
const hl = () => {
  const m = new Map<string, NodeHighlight>([["m", { role: "main", routeIndex: 0 }]]);
  addIoHighlights(m, task, 0);
  return m;
};

describe("task-driven edge flow", () => {
  it("classifies io nodes as in / out / both", () => {
    const m = hl();
    expect([m.get("i")?.flow, m.get("o")?.flow, m.get("x")?.flow]).toEqual(["in", "out", "both"]);
  });
  it("input flows into main whichever way the edge was drawn", () => {
    const m = hl();
    expect(activeEdgeFlow(m.get("i"), m.get("m"))?.dir).toBe("forward"); // edge i -> m
    expect(activeEdgeFlow(m.get("m"), m.get("i"))?.dir).toBe("backward"); // edge m -> i
  });
  it("output flows out of main whichever way the edge was drawn", () => {
    const m = hl();
    expect(activeEdgeFlow(m.get("m"), m.get("o"))?.dir).toBe("forward");
    expect(activeEdgeFlow(m.get("o"), m.get("m"))?.dir).toBe("backward");
  });
  it("in-and-out node shuttles; io-io edges are not live", () => {
    const m = hl();
    expect(activeEdgeFlow(m.get("m"), m.get("x"))?.dir).toBe("both");
    expect(activeEdgeFlow(m.get("i"), m.get("o"))).toBeNull();
  });
});
