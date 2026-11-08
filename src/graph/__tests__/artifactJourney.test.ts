import { describe, expect, it } from "vitest";
import { actionIssues } from "../actionCheck";
import { artifactJourney, deleteArtifact, fullMainRoute, type JourneyItem } from "../artifactJourney";
import { normalizeLoomDocument } from "../normalizeDocument";
import uneven from "../../../samples/parallel-uneven-v3.json";
import receipt from "../../../samples/receipt-automation-v3.json";
import type { LoomDocumentInput } from "../../types";

const doc = normalizeLoomDocument(uneven as unknown as LoomDocumentInput);
const flat = (items: JourneyItem[]): unknown[] =>
  items.map((i) => ("event" in i ? `${i.event.taskLabel}:${i.event.text}` : { fork: i.fork.map(flat) }));

describe("artifact journey (DESIGN_v3 §4 item 8)", () => {
  it("replays the whole main route", () => {
    expect(fullMainRoute(doc)).toEqual([["t1"], ["t2a", "t2b"], ["t3a"], ["t4a"], ["t5"]]);
  });
  it("forks where parallel tasks take it", () => {
    expect(flat(artifactJourney(doc, "photo").items)).toEqual([
      "写真をアップロード:生まれる",
      "写真をアップロード:写真アプリへ渡る",
      { fork: [["人物解析:写真アプリから写しが届く（もとは残る）"], ["背景解析:写真アプリから写しが届く（もとは残る）"]] },
    ]);
  });
  it("a straight journey ends where it is used up", () => {
    expect(flat(artifactJourney(doc, "bg_tags").items)).toEqual([
      "背景解析:生まれる",
      "確認:背景解析エージェントから届く",
      "確認:確かめられる",
      "まとめる:確認担当から届く",
      "まとめる:形を変えて「写真の説明文」になる（役目を終える）",
    ]);
    expect(artifactJourney(doc, "bg_tags").usedIn).toEqual(["t2b", "t4a", "t5"]);
  });
  it("branches that meet again continue on one line", () => {
    const d = normalizeLoomDocument(receipt as unknown as LoomDocumentInput);
    const items = flat(artifactJourney(d, "text").items);
    const forkAt = items.findIndex((x) => typeof x === "object");
    expect(forkAt).toBeGreaterThan(0);
    expect((items[forkAt] as { fork: unknown[][] }).fork.length).toBe(2);
  });
  it("deleting strips it from actions and marks the ones left non-empty", () => {
    const d = deleteArtifact(doc, "bg_tags");
    expect(d.artifacts?.some((a) => a.id === "bg_tags")).toBe(false);
    const t4a = d.flow.tasks.find((t) => t.id === "t4a")!;
    expect(t4a.actions![1].artifacts).toBeUndefined();
    expect(t4a.actions![1].removedArtifacts).toBeUndefined();
    expect(t4a.actions![2].artifacts).toEqual(["person_tags_clean"]);
    expect(t4a.actions![2].removedArtifacts).toEqual(["背景タグ"]);
    expect(actionIssues(d, "t4a", 1).map((x) => x.text)).toContain("対象のアーティファクトがありません");
    expect(actionIssues(d, "t4a", 2).map((x) => x.text)).toContain("「背景タグ」を一覧から消したため外しました");
  });
});
