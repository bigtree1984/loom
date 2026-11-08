import { describe, expect, it } from "vitest";
import { actionIssues, placesBeforeAction, usableTarget } from "../actionCheck";
import { normalizeLoomDocument } from "../normalizeDocument";
import sample from "../../../samples/parallel-uneven-v3.json";
import type { LoomDocument, LoomDocumentInput } from "../../types";

const doc = normalizeLoomDocument(sample as unknown as LoomDocumentInput);
const withActions = (d: LoomDocument, taskId: string, f: (a: NonNullable<LoomDocument["flow"]["tasks"][0]["actions"]>) => typeof a) => ({
  ...d,
  flow: { ...d.flow, tasks: d.flow.tasks.map((t) => (t.id === taskId ? { ...t, actions: f(t.actions ?? []) } : t)) },
});

describe("action checks (DESIGN_v3 §4 item 8)", () => {
  it("a join's actions see what both branches brought", () => {
    const places = placesBeforeAction(doc, "t4a", 0);
    expect(places.get("person_tags_clean")?.node).toBe("person_agent");
    expect(places.get("bg_tags")?.node).toBe("bg_agent");
    [0, 1, 2].forEach((i) => expect(actionIssues(doc, "t4a", i)).toEqual([]));
  });
  it("inspecting before receiving is flagged, not blocked", () => {
    const moved = withActions(doc, "t4a", (a) => [a[2], a[0], a[1]]);
    const issues = actionIssues(moved, "t4a", 0);
    expect(issues.map((x) => x.text)).toEqual([
      "「人物タグ（整理済み）」は確認担当にありません（人物解析エージェントにあります）",
      "「背景タグ」は確認担当にありません（背景解析エージェントにあります）",
    ]);
  });
  it("receive candidates are what sits at the source node", () => {
    const a = doc.flow.tasks.find((t) => t.id === "t4a")!.actions![1];
    const places = placesBeforeAction(doc, "t4a", 1);
    expect(usableTarget(places, a, "reviewer", "bg_tags")).toBe(true);
    expect(usableTarget(places, a, "reviewer", "person_tags_clean")).toBe(false);
  });
  it("missing fields and removed artifacts are reported", () => {
    const d = withActions(doc, "t5", (a) => [{ type: "send" }, { ...a[0], removedArtifacts: ["古いタグ"] }]);
    expect(actionIssues(d, "t5", 0).map((x) => x.text)).toEqual(["対象のアーティファクトがありません", "渡し先のノードが決まっていません"]);
    expect(actionIssues(d, "t5", 1).map((x) => x.text)).toEqual(["「古いタグ」を一覧から消したため外しました"]);
  });
});
