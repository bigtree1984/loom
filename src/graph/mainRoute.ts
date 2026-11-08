import type { Connection, LoomDocument } from "../types";
import { findBackEdgeKeys, findRootId } from "./graphUtils";

/**
 * Main route (DESIGN_v3 §3.13): jumping straight to a task replays the
 * flow from the start along the main route, so the artifacts are where
 * they would be. At a decision the option leading to the target wins;
 * otherwise the one marked `main: true`, else the default (the last
 * forward option — what auto-play picks). Parallel branches all run;
 * loop-backs are never taken.
 */
export type JoinArrivals = Record<string, string[] | "bypass">;
export interface FlowSnapshot {
  position: string[];
  joinArrivals: JoinArrivals;
}

export function flowContext(doc: LoomDocument) {
  const ids = doc.flow.tasks.map((t) => t.id);
  const outgoing = new Map<string, Connection[]>();
  const incoming = new Map<string, Connection[]>();
  doc.flow.connections.forEach((c) => {
    outgoing.set(c.from, [...(outgoing.get(c.from) ?? []), c]);
    incoming.set(c.to, [...(incoming.get(c.to) ?? []), c]);
  });
  const back = findBackEdgeKeys(ids, doc.flow.connections);
  const isBack = (c: Connection) => back.has(`${c.from}::${c.to}`);
  // Incoming forward edges per task; 2+ makes a join (whether it waits is
  // decided as it runs — see joinWaiting).
  const required = new Map(ids.map((id) => [id, (incoming.get(id) ?? []).filter((c) => !isBack(c)).length]));
  const reaches = reachability(outgoing, isBack);
  const isJoin = (id: string) => (required.get(id) ?? 0) >= 2;
  /** Decision options in display order: loop-backs first, the main one last
   * (the last option is the default everywhere). */
  const sortedOptions = (id: string) =>
    (outgoing.get(id) ?? [])
      .filter((o) => !!o.label)
      .map((o, i) => ({ o, i }))
      .sort((a, b) => rank(a.o) - rank(b.o) || a.i - b.i)
      .map(({ o }) => o);
  const rank = (o: Connection) => (isBack(o) ? 0 : o.main ? 2 : 1);
  return { ids, outgoing, incoming, isBack, required, isJoin, reaches, sortedOptions, root: findRootId(ids, doc.flow.connections) };
}
export type FlowContext = ReturnType<typeof flowContext>;

/** Tasks reachable from each task without loop-backs (itself included). */
export function reachability(outgoing: Map<string, Connection[]>, isBack: (c: Connection) => boolean) {
  const memo = new Map<string, Set<string>>();
  const reach = (id: string): Set<string> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const set = new Set<string>([id]);
    memo.set(id, set);
    (outgoing.get(id) ?? []).forEach((c) => !isBack(c) && reach(c.to).forEach((x) => set.add(x)));
    return set;
  };
  return (from: string, to: string) => reach(from).has(to);
}

/**
 * A join waits while some other task still in play can reach it — a
 * parallel branch that hasn't arrived yet. A decision's other options never
 * get a task in play, so a join after either-or branches doesn't wait for
 * them, however long the branches are (DESIGN_v3 §3.13). A loop-back
 * re-entry ("bypass") never waits. Judged on the snapshot at the start of
 * the step: a branch arriving during a step lets the join run the next one.
 */
export function joinWaiting(ctx: FlowContext, s: FlowSnapshot, id: string): boolean {
  if (!ctx.isJoin(id) || s.joinArrivals[id] === "bypass") return false;
  return s.position.some((t) => t !== id && ctx.reaches(t, id));
}

/** One step of the flow (the same rule as 次へ / choosing an option).
 * Returns null when nothing would change. */
/** Tasks of a snapshot that actually run in it: a join still waiting on
 * other branches stays in `position` (to keep counting arrivals) but has
 * not started — it is neither highlighted nor replayed until it runs. */
export function runningTasks(ctx: FlowContext, s: FlowSnapshot): string[] {
  return s.position.filter((id) => !joinWaiting(ctx, s, id));
}

export function stepFlow(ctx: FlowContext, s: FlowSnapshot, choices: Record<string, string> = {}): FlowSnapshot | null {
  const next: string[] = [];
  const arrivals: JoinArrivals = {};
  Object.entries(s.joinArrivals).forEach(([k, v]) => (arrivals[k] = v === "bypass" ? "bypass" : [...v]));
  for (const id of s.position) {
    if (joinWaiting(ctx, s, id)) {
      next.push(id);
      continue;
    }
    const outs = ctx.outgoing.get(id) ?? [];
    if (outs.length === 0) continue;
    let targets: string[];
    if (outs.some((o) => !!o.label)) {
      const chosen = choices[id];
      if (!chosen) {
        next.push(id);
        continue;
      }
      targets = [chosen];
    } else targets = outs.map((o) => o.to);
    delete arrivals[id];
    targets.forEach((t) => {
      if (ctx.isJoin(t)) {
        if (ctx.isBack({ from: id, to: t })) arrivals[t] = "bypass";
        else {
          const a = arrivals[t];
          const arr = a === "bypass" ? [] : (a ?? []);
          if (!arr.includes(id)) arrivals[t] = [...arr, id];
        }
      }
      next.push(t);
    });
  }
  const position = Array.from(new Set(next));
  const same =
    position.length === s.position.length &&
    position.every((id, i) => id === s.position[i]) &&
    JSON.stringify(arrivals) === JSON.stringify(s.joinArrivals);
  if (position.length === 0 || same) return null;
  return { position, joinArrivals: arrivals };
}

/** Snapshots from the start up to the first one where `target` runs (a join
 * still waiting does not count)
 * (inclusive), along the main route; null if it can't be reached. */
export function mainRouteTo(doc: LoomDocument, target: string, maxSteps = 500): FlowSnapshot[] | null {
  const ctx = flowContext(doc);
  if (!ctx.root) return null;
  // Tasks from which `target` is reachable without loop-backs.
  const leadsTo = new Set<string>([target]);
  let grew = true;
  while (grew) {
    grew = false;
    doc.flow.connections.forEach((c) => {
      if (!ctx.isBack(c) && leadsTo.has(c.to) && !leadsTo.has(c.from)) {
        leadsTo.add(c.from);
        grew = true;
      }
    });
  }
  let s: FlowSnapshot = { position: [ctx.root], joinArrivals: {} };
  const out = [s];
  // First snapshot holding `target` at all: a fallback should the target
  // never get to run (e.g. a join behind a decision left unresolved).
  let reached = -1;
  for (let i = 0; i < maxSteps; i++) {
    if (runningTasks(ctx, s).includes(target)) return out;
    if (reached < 0 && s.position.includes(target)) reached = out.length - 1;
    const choices: Record<string, string> = {};
    s.position.forEach((id) => {
      const opts = ctx.sortedOptions(id).filter((o) => !ctx.isBack(o));
      if (!opts.length) return;
      const toward = opts.filter((o) => leadsTo.has(o.to));
      const pick = (toward.length ? toward : opts).at(-1)!;
      choices[id] = pick.to;
    });
    const n = stepFlow(ctx, s, choices);
    if (!n) return reached >= 0 ? out.slice(0, reached + 1) : null;
    s = n;
    out.push(s);
  }
  return reached >= 0 ? out.slice(0, reached + 1) : null;
}
