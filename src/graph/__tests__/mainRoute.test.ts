import { describe, expect, it } from "vitest";
import { mainRouteTo } from "../mainRoute";
import { normalizeLoomDocument } from "../normalizeDocument";
import receipt from "../../../samples/receipt-automation-v3.json";
import type { LoomDocumentInput } from "../../types";

const doc = normalizeLoomDocument(receipt as unknown as LoomDocumentInput);
const route = (t: string, d = doc) => mainRouteTo(d, t)?.map((s) => s.position.join("+"));

describe("mainRouteTo", () => {
  it("runs parallel branches and the join", () => {
    expect(route("t5")).toEqual(["t1", "t2", "t3", "t4a+t4b", "t5"]);
  });
  it("takes the branch that leads to the target", () => {
    expect(route("t9")).toEqual(["t1", "t2", "t3", "t4a+t4b", "t5", "t7", "t8", "t8f", "t9"]);
    expect(route("t6")?.at(-2)).toBe("t5");
  });
  it("prefers main: true when either option reaches the target", () => {
    const withLoop = normalizeLoomDocument({
      ...(receipt as object),
      flow: {
        ...(receipt as { flow: { tasks: unknown[]; connections: object[] } }).flow,
        connections: [
          ...(receipt as { flow: { connections: object[] } }).flow.connections,
          { from: "t6", to: "done" },
          { from: "t9", to: "done" },
        ],
        tasks: [...(receipt as { flow: { tasks: unknown[] } }).flow.tasks, { id: "done", label: "完了", mainNode: "google_sheets", actions: [] }],
      },
    } as unknown as LoomDocumentInput);
    // Default: the last forward option (低信頼度).
    expect(route("done", withLoop)).toContain("t7");
    const flagged = structuredClone(withLoop);
    flagged.flow.connections.find((c) => c.label === "高信頼度")!.main = true;
    expect(route("done", flagged)).toContain("t6");
    expect(route("done", flagged)).not.toContain("t7");
  });
});
