import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../normalizeDocument";
import { toArchitectureFlow } from "../toArchitectureFlow";
import type { LoomDocumentInput } from "../../types";

const root = path.resolve(__dirname, "../../..");
const files = ["samples", "src/sample-data"].flatMap((dir) =>
  fs
    .readdirSync(path.join(root, dir))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f)),
);

describe("bundled sample documents", () => {
  it("found samples", () => expect(files.length).toBeGreaterThan(0));
  it.each(files)("%s normalizes and lays out", (file) => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, file), "utf-8")) as LoomDocumentInput;
    const doc = normalizeLoomDocument(raw);
    // Every node got a cell, edges survived the a/b -> from/to rename.
    doc.architecture.nodes.forEach((n) => {
      expect(Number.isInteger(n.col)).toBe(true);
      expect(Number.isInteger(n.row)).toBe(true);
    });
    expect(doc.architecture.edges.length).toBe(
      (raw.architecture?.edges ?? []).filter((e) => {
        const ids = new Set(doc.architecture.nodes.map((n) => n.id));
        return ids.has((e.from ?? e.a)!) && ids.has((e.to ?? e.b)!);
      }).length,
    );
    const out = toArchitectureFlow(doc.architecture, new Map());
    expect(out.nodes).toHaveLength(doc.architecture.nodes.length);
    const seen = new Set<string>();
    out.nodes.forEach((n) => {
      const k = `${n.position.x},${n.position.y}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    });
    // Same cells, hex rendering: still no overlaps.
    const hex = toArchitectureFlow({ ...doc.architecture, layout: "hex" }, new Map());
    expect(new Set(hex.nodes.map((n) => `${n.position.x},${n.position.y}`)).size).toBe(hex.nodes.length);
  });
});
