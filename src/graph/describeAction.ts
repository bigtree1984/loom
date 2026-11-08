import type { LoomDocument, Task, TaskAction } from "../types";

/** A one-line caption for an action: its own `label`, or a sentence built
 * from the type ("GCS から 画像 12枚 を受け取る（写し）"). Subject is the
 * task's node, so it's left out — the caption sits under the task name. */
export function describeAction(a: TaskAction, doc: LoomDocument): string {
  if (a.label) return a.label;
  const art = new Map((doc.artifacts ?? []).map((x) => [x.id, x.label]));
  const isTool = new Set((doc.artifacts ?? []).filter((x) => x.tool).map((x) => x.id));
  // Multi-line node labels ("BigQuery\n回答と成績の記録"): the first line
  // names it well enough in a one-line caption.
  const node = new Map(doc.architecture.nodes.map((n) => [n.id, n.label.split("\n")[0]]));
  // Half-written actions (editing): name the blank instead of "undefined".
  const TBD = "（未定）";
  const list = (ids?: string[]) => (ids ?? []).map((id) => art.get(id) ?? id).join("・") || TBD;
  const nodeOf = (id?: string) => (id ? (node.get(id) ?? id) : TBD);
  // Tools read as "〜を使って", not as material.
  const toolIds = a.artifacts?.filter((id) => isTool.has(id)) ?? [];
  const tools = toolIds.length ? list(toolIds) : "";
  const using = tools ? `${tools} を使って ` : "";
  const ins = list(a.type === "derive" || a.type === "transform" ? a.artifacts?.filter((id) => !isTool.has(id)) : a.artifacts);
  const outs = list(a.results);
  const copy = a.keep ? "（写し）" : "";
  switch (a.type) {
    case "create":
      return `${outs} を作る`;
    case "send":
      return `${nodeOf(a.to)} へ ${ins} を渡す${copy}`;
    case "receive":
      return `${nodeOf(a.from)} から ${ins} を受け取る${copy}`;
    case "transform":
      return `${using}${ins} を ${outs} に変える`;
    case "derive":
      // Only tools as input (or none yet): "〜を使って X を作る".
      return a.artifacts?.some((id) => !isTool.has(id)) ? `${using}${ins} をもとに ${outs} を作る` : `${using}${outs} を作る`;
    case "inspect":
      return `${ins} を確かめる`;
    case "discard":
      return `${ins} を捨てる`;
  }
}

/** The current step's actions in play order (index = action slot). With
 * parallel tasks, slot i holds every task's i-th action. */
export function stepActions(tasks: Task[]): { index: number; task: Task; action: TaskAction }[][] {
  const n = Math.max(0, ...tasks.map((t) => t.actions?.length ?? 0));
  return Array.from({ length: n }, (_, i) =>
    tasks.flatMap((t) => (t.actions?.[i] ? [{ index: i, task: t, action: t.actions[i] }] : [])),
  );
}
