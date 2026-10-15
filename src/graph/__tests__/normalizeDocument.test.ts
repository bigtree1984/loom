import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../normalizeDocument";
import type { LoomDocument, LoomDocumentInput } from "../../types";

describe("normalizeLoomDocument", () => {
  it("fills missing arrays with []", () => {
    const raw = {
      architecture: {},
      flow: { tasks: [{ id: "t", label: "T", description: "", mainNode: "n" }] },
    } as unknown as LoomDocument;
    const doc = normalizeLoomDocument(raw);
    expect(doc.architecture.nodes).toEqual([]);
    expect(doc.architecture.edges).toEqual([]);
    expect(doc.architecture.columns).toEqual([]);
    expect(doc.flow.connections).toEqual([]);
    expect(doc.flow.tasks[0].inputNodes).toEqual([]);
    expect(doc.flow.tasks[0].outputNodes).toEqual([]);
  });

  it("survives a totally empty object", () => {
    const doc = normalizeLoomDocument({} as unknown as LoomDocument);
    expect(doc.architecture.nodes).toEqual([]);
    expect(doc.flow.tasks).toEqual([]);
  });

  it("migrates a v1 document to v2", () => {
    const raw: LoomDocumentInput = {
      architecture: {
        nodes: [
          { id: "a", label: "A", type: "backend", group: "g" },
          { id: "b", label: "B", type: "backend", group: "g", rowOrder: -1 },
          { id: "s", label: "", type: "spacer", group: "g" },
          { id: "h", label: "H", type: "human" },
        ],
        edges: [{ a: "h", b: "a", label: "x" }],
        groups: [{ id: "g", label: "G" }],
        laneOrder: ["__human__", "g"],
      },
      flow: {
        tasks: [{ id: "t", label: "T", description: "", mainNode: "a", inputNodes: ["a"], outputNodes: [] }],
        connections: [],
      },
    };
    const doc = normalizeLoomDocument(raw);
    expect(doc.version).toBe(2);
    expect(doc.architecture.layout).toBe("grid");
    expect(doc.architecture.nodes.map((n) => n.id)).toEqual(["a", "b", "h"]); // spacer dropped
    expect(doc.architecture.columns.map((c) => c.id)).toEqual(["human", "g"]); // laneOrder honoured
    const byId = Object.fromEntries(doc.architecture.nodes.map((n) => [n.id, n]));
    expect(byId.h.col).toBe(0);
    expect(byId.a.col).toBe(1);
    expect(byId.b.col).toBe(1);
    expect(byId.b.row).toBeLessThan(byId.a.row!); // rowOrder -1 pins b above a
    expect(doc.architecture.nodes.every((n) => n.group === undefined && n.rowOrder === undefined)).toBe(true);
    expect(doc.architecture.edges).toEqual([{ from: "h", to: "a", label: "x" }]);
    expect(doc.flow.tasks[0].inputNodes).toEqual(["a"]);
  });

  it("is idempotent on v2 output", () => {
    const once = normalizeLoomDocument({
      architecture: { nodes: [{ id: "a", label: "A", type: "agent" }, { id: "b", label: "B", type: "agent" }] },
    });
    expect(normalizeLoomDocument(once)).toEqual(once);
  });

  it("places stragglers into their group column without touching placed nodes", () => {
    const doc = normalizeLoomDocument({
      architecture: {
        columns: [{ id: "c0", label: "" }, { id: "c1", label: "" }],
        nodes: [
          { id: "a", label: "A", type: "agent", col: 1, row: 0 },
          { id: "n", label: "N", type: "agent", group: "c1" },
          { id: "z", label: "Z", type: "agent" },
        ],
      },
    });
    const byId = Object.fromEntries(doc.architecture.nodes.map((n) => [n.id, n]));
    expect(byId.a).toMatchObject({ col: 1, row: 0 });
    expect(byId.n).toMatchObject({ col: 1, row: 1 });
    expect(byId.z.col).toBe(2); // no hint: new column at the right
  });

  it("separates two nodes declared on the same cell", () => {
    const doc = normalizeLoomDocument({
      architecture: {
        nodes: [
          { id: "a", label: "A", type: "agent", col: 0, row: 0 },
          { id: "b", label: "B", type: "agent", col: 0, row: 0 },
        ],
      },
    });
    expect(doc.architecture.nodes.map((n) => n.row)).toEqual([0, 1]);
  });
});
