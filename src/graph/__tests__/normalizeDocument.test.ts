import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../normalizeDocument";
import type { LoomDocument } from "../../types";

describe("normalizeLoomDocument", () => {
  it("fills missing arrays with []", () => {
    const raw = {
      architecture: {},
      flow: { tasks: [{ id: "t", label: "T", description: "", mainNode: "n" }] },
    } as unknown as LoomDocument;
    const doc = normalizeLoomDocument(raw);
    expect(doc.architecture.nodes).toEqual([]);
    expect(doc.architecture.edges).toEqual([]);
    expect(doc.architecture.groups).toBeUndefined();
    expect(doc.flow.connections).toEqual([]);
    expect(doc.flow.tasks[0].inputNodes).toEqual([]);
    expect(doc.flow.tasks[0].outputNodes).toEqual([]);
  });

  it("survives a totally empty object", () => {
    const doc = normalizeLoomDocument({} as unknown as LoomDocument);
    expect(doc.architecture.nodes).toEqual([]);
    expect(doc.flow.tasks).toEqual([]);
  });

  it("keeps existing values", () => {
    const raw: LoomDocument = {
      architecture: {
        nodes: [{ id: "a", label: "A", type: "backend" }],
        edges: [],
        groups: [{ id: "g", label: "G" }],
        laneOrder: ["g"],
      },
      flow: {
        tasks: [{ id: "t", label: "T", description: "", mainNode: "a", inputNodes: ["a"], outputNodes: [] }],
        connections: [],
      },
    };
    const doc = normalizeLoomDocument(raw);
    expect(doc.architecture.nodes).toHaveLength(1);
    expect(doc.architecture.groups).toHaveLength(1);
    expect(doc.architecture.laneOrder).toEqual(["g"]);
    expect(doc.flow.tasks[0].inputNodes).toEqual(["a"]);
  });
});
