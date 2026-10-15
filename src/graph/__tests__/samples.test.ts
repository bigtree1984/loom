import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeLoomDocument } from "../normalizeDocument";
import { toArchitectureFlow } from "../toArchitectureFlow";
import type { LoomDocument } from "../../types";

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
    const raw = JSON.parse(fs.readFileSync(path.join(root, file), "utf-8")) as LoomDocument;
    const doc = normalizeLoomDocument(raw);
    const out = toArchitectureFlow(doc.architecture, doc.flow, new Map());
    expect(out.nodes).toHaveLength(doc.architecture.nodes.length);
    const seen = new Set<string>();
    out.nodes.forEach((n) => {
      const k = `${n.position.x},${n.position.y}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    });
  });
});
