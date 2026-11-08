import type { LoomDocument, TaskAction } from "../types";
import { artifactStateAt, type ArtifactPlaces } from "./artifactState";
import { flowContext, mainRouteTo, runningTasks } from "./mainRoute";

/**
 * Editor checks (DESIGN_v3 §4 item 8): replay from the start along the main
 * route to the task (a branch task through its branch, a join through the
 * main route), then through the task's own actions before `index`, and say
 * what each action can use there. Nothing is blocked — an action that does
 * not fit just gets reasons (⚠).
 */
export function placesBeforeAction(doc: LoomDocument, taskId: string, index: number): ArtifactPlaces {
  const task = doc.flow.tasks.find((t) => t.id === taskId);
  const cut: LoomDocument = {
    ...doc,
    flow: {
      ...doc.flow,
      tasks: doc.flow.tasks.map((t) => (t.id === taskId ? { ...t, actions: (t.actions ?? []).slice(0, index) } : t)),
    },
  };
  const route = mainRouteTo(doc, taskId);
  const ctx = flowContext(doc);
  const steps = route ? route.map((s) => runningTasks(ctx, s)) : [[taskId]];
  if (!task) return artifactStateAt(cut, []).places;
  return artifactStateAt(cut, steps).places;
}

/** Types whose `artifacts` must already sit on the subject node. */
const ON_SUBJECT = new Set(["send", "transform", "derive", "inspect", "discard"]);
export const NEEDS_ARTIFACTS = new Set(["send", "receive", "transform", "derive", "inspect", "discard"]);
export const NEEDS_RESULTS = new Set(["create", "transform", "derive"]);

/** Can this artifact be the action's target at that point? */
export function usableTarget(places: ArtifactPlaces, action: TaskAction, subject: string, id: string): boolean {
  const p = places.get(id);
  if (!p?.visible || !p.node) return false;
  if (action.type === "receive") return action.from ? p.node === action.from : p.node !== subject;
  if (ON_SUBJECT.has(action.type)) return p.node === subject;
  return false;
}

/** Can this artifact be made by the action (not already present)? */
export function usableResult(places: ArtifactPlaces, id: string): boolean {
  return !places.get(id)?.visible;
}

export interface ActionIssue {
  /** Short reason shown next to ⚠. */
  text: string;
}

export function actionIssues(doc: LoomDocument, taskId: string, index: number, places = placesBeforeAction(doc, taskId, index)): ActionIssue[] {
  const task = doc.flow.tasks.find((t) => t.id === taskId);
  const action = task?.actions?.[index];
  if (!task || !action) return [];
  const label = (id: string) => doc.artifacts?.find((a) => a.id === id)?.label ?? id;
  const nodeLabel = (id?: string) => doc.architecture.nodes.find((n) => n.id === id)?.label ?? id ?? "";
  const out: ActionIssue[] = [];
  const ins = action.artifacts ?? [];
  const outs = action.results ?? [];
  (action.removedArtifacts ?? []).forEach((l) => out.push({ text: `「${l}」を一覧から消したため外しました` }));
  if (NEEDS_ARTIFACTS.has(action.type) && ins.length === 0) out.push({ text: "対象のアーティファクトがありません" });
  if (NEEDS_RESULTS.has(action.type) && outs.length === 0) out.push({ text: "結果のアーティファクトがありません" });
  if (action.type === "receive" && !action.from) out.push({ text: "受け取り元のノードが決まっていません" });
  if (action.type === "send" && !action.to) out.push({ text: "渡し先のノードが決まっていません" });
  ins.forEach((id) => {
    if (usableTarget(places, action, task.mainNode, id)) return;
    const p = places.get(id);
    const where = p?.visible && p.node ? `${nodeLabel(p.node)}にあります` : "この時点ではまだありません（または役目を終えています）";
    const need = action.type === "receive" ? (action.from ? `${nodeLabel(action.from)}` : "ほかのノード") : nodeLabel(task.mainNode);
    out.push({ text: `「${label(id)}」は${need}にありません（${where}）` });
  });
  outs.forEach((id) => {
    if (!usableResult(places, id)) out.push({ text: `「${label(id)}」はこの時点でもうあります` });
  });
  return out;
}

/** Tasks with at least one action issue (for ⚠ on the process flow). */
export function tasksWithIssues(doc: LoomDocument): Set<string> {
  const out = new Set<string>();
  doc.flow.tasks.forEach((t) => {
    (t.actions ?? []).some((_, i) => actionIssues(doc, t.id, i).length > 0) && out.add(t.id);
  });
  return out;
}
