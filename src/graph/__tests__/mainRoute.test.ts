import { describe, expect, it } from "vitest";
import { flowContext, mainRouteTo, runningTasks, stepFlow, type FlowSnapshot } from "../mainRoute";
import { normalizeLoomDocument } from "../normalizeDocument";
import receipt from "../../../samples/receipt-automation-v3.json";
import unevenSample from "../../../samples/parallel-uneven-v3.json";
import { artifactStateAt } from "../artifactState";
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

describe("parallel branches of different lengths", () => {
  const uneven = normalizeLoomDocument(unevenSample as unknown as LoomDocumentInput);
  it("jumps to the join only once every branch has arrived", () => {
    expect(route("t4a", uneven)).toEqual(["t1", "t2a+t2b", "t3a+t4a", "t4a"]);
  });
  it("does not replay the join's actions while it waits", () => {
    const ctx = flowContext(uneven);
    const steps = mainRouteTo(uneven, "t5")!.map((s) => runningTasks(ctx, s));
    expect(steps).toEqual([["t1"], ["t2a", "t2b"], ["t3a"], ["t4a"], ["t5"]]);
    const waiting = artifactStateAt(uneven, steps.slice(0, 3)).places;
    expect(waiting.get("bg_tags")).toEqual({ node: "bg_agent", visible: true });
    const before = artifactStateAt(uneven, steps.slice(0, 4)).places;
    expect(before.get("bg_tags")).toEqual({ node: "reviewer", visible: true });
    expect(before.get("caption")?.visible).toBe(false);
    expect(artifactStateAt(uneven, steps).places.get("caption")).toEqual({ node: "app", visible: true });
  });
});

describe("joins after a decision (either-or branches)", () => {
  const mk = (connections: { from: string; to: string; label?: string; main?: boolean }[], ids: string[]) =>
    normalizeLoomDocument({
      version: 2,
      architecture: { nodes: [{ id: "n", label: "n", type: "backend" }], edges: [] },
      flow: { tasks: ids.map((id) => ({ id, label: id, description: "", mainNode: "n", inputNodes: [], outputNodes: [] })), connections },
    } as unknown as LoomDocumentInput);
  const play = (d: LoomDocument, choices: Record<string, string>) => {
    const ctx = flowContext(d);
    let s: FlowSnapshot = { position: [ctx.root], joinArrivals: {} };
    const steps: string[] = [];
    for (let i = 0; i < 10; i++) {
      steps.push(runningTasks(ctx, s).join("+"));
      const n = stepFlow(ctx, s, choices);
      if (!n) break;
      s = n;
    }
    return steps;
  };
  it("multi-task options meeting again don't wait for the option not taken", () => {
    const d = mk(
      [
        { from: "s", to: "a1", label: "A" },
        { from: "s", to: "b1", label: "B" },
        { from: "a1", to: "a2" },
        { from: "a2", to: "j" },
        { from: "b1", to: "j" },
      ],
      ["s", "a1", "a2", "b1", "j"],
    );
    expect(play(d, { s: "b1" })).toEqual(["s", "b1", "j"]);
    expect(play(d, { s: "a1" })).toEqual(["s", "a1", "a2", "j"]);
    expect(route("j", d)).toEqual(["s", "b1", "j"]);
  });
  it("an uneven parallel fork inside one option still waits for its longer branch", () => {
    const d = mk(
      [
        { from: "s", to: "f", label: "A" },
        { from: "s", to: "b", label: "B" },
        { from: "f", to: "p1" },
        { from: "f", to: "p2" },
        { from: "p1", to: "p1b" },
        { from: "p1b", to: "j" },
        { from: "p2", to: "j" },
        { from: "b", to: "j" },
      ],
      ["s", "f", "p1", "p1b", "p2", "b", "j"],
    );
    expect(play(d, { s: "f" })).toEqual(["s", "f", "p1+p2", "p1b", "j"]);
    expect(play(d, { s: "b" })).toEqual(["s", "b", "j"]);
  });
});
