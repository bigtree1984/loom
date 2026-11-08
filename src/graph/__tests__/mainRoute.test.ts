import { describe, expect, it } from "vitest";
import { flowContext, mainRouteTo, runningTasks, stepFlow, type FlowSnapshot } from "../mainRoute";
import { normalizeLoomDocument } from "../normalizeDocument";
import receipt from "../../../samples/receipt-automation-v3.json";
import type { LoomDocument, LoomDocumentInput } from "../../types";

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

describe("runningTasks", () => {
  it("leaves out a join still waiting on a longer branch", () => {
    const d = {
      flow: {
        tasks: ["s", "a1", "a2", "b", "j"].map((id) => ({ id, label: id, description: "", mainNode: "n", inputNodes: [], outputNodes: [] })),
        connections: [
          { from: "s", to: "a1" },
          { from: "s", to: "b" },
          { from: "a1", to: "a2" },
          { from: "a2", to: "j" },
          { from: "b", to: "j" },
        ],
      },
    } as unknown as LoomDocument;
    const ctx = flowContext(d);
    let s: FlowSnapshot = { position: ["s"], joinArrivals: {} };
    const seen: string[][] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(runningTasks(ctx, s));
      const n = stepFlow(ctx, s);
      if (!n) break;
      s = n;
    }
    expect(seen).toEqual([["s"], ["a1", "b"], ["a2"], ["j"]]);
  });
});
