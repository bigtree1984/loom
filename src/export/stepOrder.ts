import { findBackEdgeKeys } from "../graph/graphUtils";
import { computeStableOrder } from "../graph/layout";
import type { LoomDocument, Task } from "../types";

/**
 * Deterministic "one image per task" walk for the 全ステップ一括 export.
 * Loop-back connections are dropped, then tasks are sorted by ASAP rank
 * with array position as the tie-break (computeStableOrder) — the same
 * order the numbered list uses. Decision branches and fork branches each
 * get their own step, in rank order, rather than being played as
 * simultaneous routes: a note article reads one step at a time.
 */
export function stepOrder(flow: LoomDocument["flow"]): Task[] {
  const ids = flow.tasks.map((t) => t.id);
  const known = new Set(ids);
  const conns = flow.connections.filter((c) => known.has(c.from) && known.has(c.to));
  const back = findBackEdgeKeys(ids, conns);
  const edges = conns
    .filter((c) => !back.has(`${c.from}::${c.to}`))
    .map((c) => ({ source: c.from, target: c.to }));
  const order = computeStableOrder(ids, edges);
  return [...flow.tasks].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
