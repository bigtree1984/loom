import type { LoomDocument, TaskAction } from "../types";
import { flowContext, runningTasks, stepFlow, type FlowSnapshot } from "./mainRoute";

/**
 * An artifact's journey for the artifact list (DESIGN_v3 §4 item 8): where
 * it is born, which tasks handle it, how it ends. Computed by replaying the
 * whole flow along the main route — at a decision only the main option is
 * followed; parallel branches all run, so the journey forks into a tree
 * (and comes back together where the branches join).
 */

export interface JourneyEvent {
  taskId: string;
  taskLabel: string;
  nodeLabel: string;
  text: string;
}
export type JourneyItem = { event: JourneyEvent } | { fork: JourneyItem[][] };

/** Every step of the main route, start to end. */
export function fullMainRoute(doc: LoomDocument, maxSteps = 500): string[][] {
  const ctx = flowContext(doc);
  if (!ctx.root) return [];
  let s: FlowSnapshot = { position: [ctx.root], joinArrivals: {} };
  const out = [runningTasks(ctx, s)];
  for (let i = 0; i < maxSteps; i++) {
    const choices: Record<string, string> = {};
    s.position.forEach((id) => {
      const opts = ctx.sortedOptions(id).filter((o) => !ctx.isBack(o));
      if (opts.length) choices[id] = opts.at(-1)!.to;
    });
    const n = stepFlow(ctx, s, choices);
    if (!n) break;
    s = n;
    const run = runningTasks(ctx, s);
    if (run.length) out.push(run);
  }
  return out;
}

/** Tasks each task can reach without loop-backs (itself included). */
function reachability(doc: LoomDocument): (from: string, to: string) => boolean {
  const ctx = flowContext(doc);
  const memo = new Map<string, Set<string>>();
  const reach = (id: string): Set<string> => {
    const hit = memo.get(id);
    if (hit) return hit;
    const set = new Set<string>([id]);
    memo.set(id, set);
    (ctx.outgoing.get(id) ?? []).forEach((c) => {
      if (!ctx.isBack(c)) reach(c.to).forEach((x) => set.add(x));
    });
    return set;
  };
  return (from, to) => reach(from).has(to);
}

function describe(doc: LoomDocument, a: TaskAction, id: string): string | null {
  const art = (ids?: string[]) => (ids ?? []).map((x) => `「${doc.artifacts?.find((y) => y.id === x)?.label ?? x}」`).join("・");
  const node = (n?: string) => (n ? (doc.architecture.nodes.find((x) => x.id === n)?.label.split("\n")[0] ?? n) : "（未定）");
  const asTarget = a.artifacts?.includes(id);
  const asResult = a.results?.includes(id);
  if (asResult) {
    if (a.type === "transform") return `${art(a.artifacts)}が形を変えて生まれる`;
    if (a.type === "derive") return a.artifacts?.length ? `${art(a.artifacts)}をもとに生まれる` : "生まれる";
    return "生まれる";
  }
  if (!asTarget) return null;
  switch (a.type) {
    case "send":
      return a.keep ? `写しが${node(a.to)}へ渡る（もとは残る）` : `${node(a.to)}へ渡る`;
    case "receive":
      return a.keep ? `${node(a.from)}から写しが届く（もとは残る）` : `${node(a.from)}から届く`;
    case "transform":
      return `形を変えて${art(a.results)}になる（役目を終える）`;
    case "derive":
      return `${art(a.results)}のもとになる`;
    case "inspect":
      return "確かめられる";
    case "discard":
      return "捨てられる（役目を終える）";
    default:
      return null;
  }
}

export interface Journey {
  /** "最初から X にある" when the artifact has `at`. */
  start?: string;
  items: JourneyItem[];
  /** Tasks (anywhere in the flow, on the route or not) that use it. */
  usedIn: string[];
}

export function artifactJourney(doc: LoomDocument, artifactId: string, route = fullMainRoute(doc)): Journey {
  const art = doc.artifacts?.find((a) => a.id === artifactId);
  const tasks = new Map(doc.flow.tasks.map((t) => [t.id, t]));
  const nodeLabel = (n?: string) => doc.architecture.nodes.find((x) => x.id === n)?.label.split("\n")[0] ?? n ?? "";
  const reaches = reachability(doc);
  const usedIn = doc.flow.tasks
    .filter((t) => (t.actions ?? []).some((a) => a.artifacts?.includes(artifactId) || a.results?.includes(artifactId)))
    .map((t) => t.id);
  // In play order (tasks off the main route last).
  const order = new Map<string, number>();
  route.forEach((step, i) => step.forEach((id) => !order.has(id) && order.set(id, i)));
  usedIn.sort((x, y) => (order.get(x) ?? Infinity) - (order.get(y) ?? Infinity));

  // Branch bookkeeping: a sequence of items with the task it last reached.
  interface Seq {
    items: JourneyItem[];
    head?: string;
    parent?: Seq;
  }
  const root: Seq = { items: [] };
  let leaves: Seq[] = [root];
  const seen = new Set<string>();
  route.forEach((step) => {
    // Tasks of this step that touch the artifact, with their events.
    const hits = step
      .filter((id) => !seen.has(id))
      .map((id) => {
        const t = tasks.get(id)!;
        const events = (t?.actions ?? [])
          .map((a) => describe(doc, a, artifactId))
          .filter((x): x is string => !!x)
          .map((text) => ({ taskId: id, taskLabel: t.label, nodeLabel: nodeLabel(t.mainNode), text }));
        return { id, events };
      })
      .filter((h) => h.events.length > 0);
    step.forEach((id) => seen.add(id));
    if (!hits.length) return;
    // Which open branches each hit continues.
    const byLeaf = new Map<Seq, typeof hits>();
    const joins: { hit: (typeof hits)[number]; from: Seq[] }[] = [];
    hits.forEach((h) => {
      const from = leaves.filter((l) => !l.head || reaches(l.head, h.id));
      if (from.length > 1) joins.push({ hit: h, from });
      else {
        const l = from[0] ?? leaves[0];
        byLeaf.set(l, [...(byLeaf.get(l) ?? []), h]);
      }
    });
    let next = leaves.filter((l) => !joins.some((j) => j.from.includes(l)));
    joins.forEach(({ hit, from }) => {
      // Branches meet again: continue on their common parent.
      const parent = from[0].parent ?? root;
      parent.items.push(...hit.events.map((event) => ({ event })));
      parent.head = hit.id;
      next = [...next.filter((l) => l !== parent), parent];
    });
    byLeaf.forEach((hs, leaf) => {
      if (hs.length === 1) {
        leaf.items.push(...hs[0].events.map((event) => ({ event })));
        leaf.head = hs[0].id;
        return;
      }
      // Several parallel tasks take it at once: the journey forks.
      const kids: Seq[] = hs.map((h) => ({ items: h.events.map((event) => ({ event })), head: h.id, parent: leaf }));
      leaf.items.push({ fork: kids.map((k) => k.items) });
      next = [...next.filter((l) => l !== leaf), ...kids];
    });
    leaves = next;
  });
  return {
    ...(art?.at ? { start: `最初から${nodeLabel(art.at)}にある` } : {}),
    items: root.items,
    usedIn,
  };
}

/** Removes an artifact (DESIGN_v3 §4 item 8): out of every action; an
 * action that still has other artifacts keeps a mark (⚠ until edited). */
export function deleteArtifact(doc: LoomDocument, artifactId: string): LoomDocument {
  const label = doc.artifacts?.find((a) => a.id === artifactId)?.label ?? artifactId;
  return {
    ...doc,
    artifacts: (doc.artifacts ?? []).filter((a) => a.id !== artifactId),
    flow: {
      ...doc.flow,
      tasks: doc.flow.tasks.map((t) => {
        if (!t.actions?.some((a) => a.artifacts?.includes(artifactId) || a.results?.includes(artifactId))) return t;
        return {
          ...t,
          actions: t.actions.map((a) => {
            if (!a.artifacts?.includes(artifactId) && !a.results?.includes(artifactId)) return a;
            const artifacts = a.artifacts?.filter((x) => x !== artifactId);
            const results = a.results?.filter((x) => x !== artifactId);
            const left = (artifacts?.length ?? 0) + (results?.length ?? 0);
            const next: TaskAction = { ...a, artifacts, results };
            if (!artifacts?.length) delete next.artifacts;
            if (!results?.length) delete next.results;
            if (left > 0) next.removedArtifacts = [...(a.removedArtifacts ?? []), label];
            return next;
          }),
        };
      }),
    },
  };
}
