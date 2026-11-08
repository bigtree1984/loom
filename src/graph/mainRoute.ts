import type { Connection, LoomDocument } from "../types";
import { findBackEdgeKeys, findRootId } from "./graphUtils";

/**
 * Main route (DESIGN_v3 §3.12): jumping straight to a task replays the
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
  const required = new Map<string, number>();
  const decisionSourceOf = (id: string) => (incoming.get(id) ?? []).find((c) => !!c.label)?.from ?? null;
  ids.forEach((id) => {
    const groups = new Set<string>();
    let independent = 0;
    (incoming.get(id) ?? []).forEach((c) => {
      if (isBack(c)) return;
      const d = decisionSourceOf(c.from);
      if (d) groups.add(d);
      else independent++;
    });
    required.set(id, groups.size + independent);
  });
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
  return { ids, outgoing, incoming, isBack, required, isJoin, sortedOptions, root: findRootId(ids, doc.flow.connections) };
}
export type FlowContext = ReturnType<typeof flowContext>;

/** One step of the flow (the same rule as 次へ / choosing an option).
 * Returns null when nothing would change. */
export function stepFlow(ctx: FlowContext, s: FlowSnapshot, choices: Record<string, string> = {}): FlowSnapshot | null {
  const next: string[] = [];
  const arrivals: JoinArrivals = {};
  Object.entries(s.joinArrivals).forEach(([k, v]) => (arrivals[k] = v === "bypass" ? "bypass" : [...v]));
  for (const id of s.position) {
    if (ctx.isJoin(id)) {
      const e = arrivals[id];
      if (e !== "bypass" && (e?.length ?? 0) < (ctx.required.get(id) ?? 0)) {
        next.push(id);
        continue;
      }
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

/** Snapshots from the start up to the first one containing `target`
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
  for (let i = 0; i < maxSteps; i++) {
    if (s.position.includes(target)) return out;
    const choices: Record<string, string> = {};
    s.position.forEach((id) => {
      const opts = ctx.sortedOptions(id).filter((o) => !ctx.isBack(o));
      if (!opts.length) return;
      const toward = opts.filter((o) => leadsTo.has(o.to));
      const pick = (toward.length ? toward : opts).at(-1)!;
      choices[id] = pick.to;
    });
    const n = stepFlow(ctx, s, choices);
    if (!n) return null;
    s = n;
    out.push(s);
  }
  return null;
}
