import { describe, expect, it } from "vitest";
import { artifactStateAt } from "../artifactState";
import { normalizeLoomDocument } from "../normalizeDocument";

const doc = normalizeLoomDocument({
  architecture: {
    nodes: [
      { id: "A", label: "A", type: "backend", col: 0, row: 0 },
      { id: "B", label: "B", type: "backend", col: 1, row: 0 },
      { id: "C", label: "C", type: "backend", col: 2, row: 0 },
    ],
  },
  artifacts: [
    { id: "x", label: "X", at: "A" },
    { id: "y", label: "Y" },
    { id: "z", label: "Z" },
    { id: "sig", label: "合図", transient: true },
  ],
  flow: {
    tasks: [
      { id: "t0", label: "合図", description: "", mainNode: "A", inputNodes: [], outputNodes: [],
        actions: [{ type: "create", results: ["sig"] }, { type: "send", artifacts: ["sig"], to: "B" }] },
      { id: "t1", label: "加工", description: "", mainNode: "B", inputNodes: [], outputNodes: [],
        actions: [
          { type: "receive", artifacts: ["x"], from: "A" },
          { type: "transform", artifacts: ["x"], results: ["y"] },
          { type: "send", artifacts: ["y"], to: "C", keep: true },
          { type: "derive", artifacts: ["y"], results: ["z"] },
        ] },
    ],
    connections: [{ from: "t0", to: "t1" }],
  },
});

describe("artifactStateAt", () => {
  it("derives inputNodes / outputNodes from actions", () => {
    const t1 = doc.flow.tasks[1];
    expect(t1.inputNodes).toEqual(["A"]);
    expect(t1.outputNodes).toEqual(["C"]);
  });
  it("transient signal flies and is gone on arrival", () => {
    const { places, motions } = artifactStateAt(doc, [["t0"]]);
    expect(places.get("sig")).toEqual({ node: "B", visible: false });
    expect([...motions.values()].some((m) => m.ghost && m.id === "sig" && m.toNode === "B")).toBe(true);
  });
  it("receive moves, transform ends the source, keep leaves the original, derive keeps sources", () => {
    const { places, motions } = artifactStateAt(doc, [["t0"], ["t1"]]);
    expect(places.get("x")?.visible).toBe(false);
    expect(places.get("y")).toEqual({ node: "B", visible: true }); // keep: stays with B
    expect(places.get("z")).toEqual({ node: "B", visible: true });
    expect([...motions.values()].some((m) => m.ghost && m.id === "y" && m.toNode === "C")).toBe(true);
  });
  it("nothing played: only artifacts with `at` are shown", () => {
    const { places } = artifactStateAt(doc, []);
    expect(places.get("x")).toEqual({ node: "A", visible: true });
    expect(places.get("y")?.visible).toBe(false);
  });
});

import { routeAlongEdges } from "../toArtifactNodes";
describe("routeAlongEdges", () => {
  const edges = [{ from: "a", to: "b" }, { from: "c", to: "b" }, { from: "c", to: "d" }];
  it("follows edges ignoring direction", () => expect(routeAlongEdges("a", "d", edges)).toEqual(["a", "b", "c", "d"]));
  it("falls back to a direct hop", () => expect(routeAlongEdges("a", "z", edges)).toEqual(["a", "z"]));
});
