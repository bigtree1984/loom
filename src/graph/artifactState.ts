import type { Artifact, LoomDocument, Task } from "../types";

/**
 * Where every artifact is at a point in playback (DESIGN_v3 §3.6): replay
 * the actions of the tasks entered along the played path, in order.
 * Nothing about location or "used up" is stored in the document.
 */

export interface ArtifactPlace {
  /** Node it sits on (undefined = not born yet). */
  node?: string;
  visible: boolean;
  /** Derived from this artifact on the same node: drawn right below it. */
  after?: string;
}

/** What the current step did, for emphasis and animation. */
export interface ArtifactMotion {
  id: string;
  /** Node before the current step (undefined = born in this step). */
  fromNode?: string;
  /** Node after the current step (undefined = ended / never existed). */
  toNode?: string;
  /** keep:true copy, or a transient signal: flies and is gone on arrival. */
  ghost?: boolean;
  /** Born in this step. */
  born?: boolean;
  /** Ended in this step (transform / discard / transient received). */
  ended?: boolean;
  /** Touched without moving (inspect / derive source / send-keep original). */
  touched?: boolean;
  /** Nodes it passed through this step, start first (hops between them may
   * still need routing along architecture edges — see toArtifactNodes). */
  path?: string[];
  /** Index of the first / last action in the task that touched it, so the
   * looping animation can play the actions one after another. */
  start?: number;
  end?: number;
  /** First action that used it without moving it (for grouping chips). */
  touchedAt?: number;
  /** Born from this artifact on the same node (derive): appears below it. */
  bornAfter?: string;
}

export type ArtifactPlaces = Map<string, ArtifactPlace>;

export function initialPlaces(artifacts: Artifact[]): ArtifactPlaces {
  const m: ArtifactPlaces = new Map();
  artifacts.forEach((a) => m.set(a.id, { node: a.at, visible: !!a.at }));
  return m;
}

/** Apply one task's actions (subject = task.mainNode) to `places`, in place.
 * Records what happened in `motions` when given. */
export function applyTask(
  places: ArtifactPlaces,
  task: Task,
  byId: Map<string, Artifact>,
  motions?: Map<string, ArtifactMotion>,
  sources?: Map<string, string[]>,
) {
  const subject = task.mainNode;
  // Sending something that sits on another node: it is fetched from there
  // first, so that node is an input of the task too (edge highlight).
  const fetchedFrom = (node: string | undefined) => {
    if (!sources || !node || node === subject) return;
    const l = sources.get(task.id) ?? [];
    if (!l.includes(node)) l.push(node);
    sources.set(task.id, l);
  };
  let step = 0;
  const note = (id: string, m: Partial<ArtifactMotion>) => {
    if (!motions) return;
    const prev = motions.get(id);
    // Merely being used (derive source, inspect, keep original) doesn't
    // animate, so it must not stretch the chip's animation window.
    const onlyTouched = Object.keys(m).every((k) => k === "touched");
    if (!prev) {
      motions.set(id, {
        id,
        fromNode: places.get(id)?.node,
        ...m,
        ...(onlyTouched ? { touchedAt: step } : { start: step, end: step }),
      });
      return;
    }
    motions.set(id, {
      ...prev,
      ...m,
      ...(onlyTouched ? { touchedAt: prev.touchedAt ?? step } : { start: prev.start ?? step, end: step }),
    });
  };
  const place = (id: string) => places.get(id) ?? { visible: false };
  const set = (id: string, p: ArtifactPlace) => places.set(id, p);

  for (const [ai, a] of (task.actions ?? []).entries()) {
    step = ai;
    const ins = a.artifacts ?? [];
    const outs = a.results ?? [];
    switch (a.type) {
      case "create":
        outs.forEach((id) => {
          note(id, { born: true, toNode: subject, path: [subject] });
          set(id, { node: subject, visible: true });
        });
        break;
      case "send":
      case "receive": {
        const target = a.type === "send" ? a.to : subject;
        if (!target) break;
        ins.forEach((id) => {
          if (a.type === "send") fetchedFrom(place(id).node);
          const transient = !!byId.get(id)?.transient;
          // A transient signal is used up on arrival (it still flies first);
          // so is the copy of a keep:true send, handled just below.
          const vanishes = transient;
          // keep: the original stays put; a copy flies and is gone on
          // arrival. send keep = hand over a copy; receive keep = read it
          // from the source (e.g. records read out of BigQuery).
          if (a.keep) {
            note(id, { touched: true });
            ghostOf(id, place(id).node ?? (a.type === "receive" ? a.from : subject), target);
            return;
          }
          if (vanishes) {
            ghostOf(id, place(id).node ?? (a.type === "receive" ? a.from : subject), target);
            // Gone on arrival: the copy flies; the chip itself stays where
            // it was (e.g. born at the sender) and is used up there.
            set(id, { ...place(id), visible: false });
            note(id, { ended: true, toNode: undefined });
            return;
          }
          // Receiving something not born yet: the other node produced it
          // (e.g. Gemini returns a question) — it appears there, then moves.
          const unborn = !place(id).node && a.type === "receive" && !!a.from;
          const prevPath = unborn
            ? [a.from as string]
            : (motions?.get(id)?.path ?? [place(id).node].filter((n): n is string => !!n));
          note(id, { toNode: target, path: [...prevPath, target], ...(unborn ? { born: true } : {}) });
          set(id, { node: target, visible: true });
        });
        break;
      }
      case "transform":
      case "derive":
        ins.forEach((id) => {
          if (a.type === "transform") {
            note(id, { ended: true, toNode: undefined });
            set(id, { ...place(id), visible: false });
          } else note(id, { touched: true });
        });
        outs.forEach((id) => {
          const src0 = a.type === "derive" ? ins.find((i) => place(i).node === subject) : undefined;
          note(id, { born: true, toNode: subject, path: [subject], ...(src0 ? { bornAfter: src0 } : {}) });
          const src = a.type === "derive" ? ins.find((i) => place(i).node === subject) : undefined;
          set(id, { node: subject, visible: true, ...(src ? { after: src } : {}) });
        });
        break;
      case "inspect":
        ins.forEach((id) => note(id, { touched: true }));
        break;
      case "discard":
        ins.forEach((id) => {
          note(id, { ended: true, toNode: undefined });
          set(id, { ...place(id), visible: false });
        });
        break;
    }
  }

  function ghostOf(id: string, from: string | undefined, to: string) {
    if (!motions) return;
    motions.set(`${id}#ghost:${from}->${to}`, {
      id,
      fromNode: from,
      toNode: to,
      ghost: true,
      path: [from, to].filter((n): n is string => !!n),
      start: step,
      end: step,
    });
  }
}

/**
 * Places after the whole played path, plus what the latest step did.
 * `steps` = the sequence of positions (each a list of current task ids),
 * oldest first, the current position last. A task is applied in the step
 * where it first becomes current (it stays current while waiting at a join).
 */
export function artifactStateAt(
  doc: LoomDocument,
  steps: string[][],
): {
  places: ArtifactPlaces;
  motions: Map<string, ArtifactMotion>;
  before: ArtifactPlaces;
  actionCount: number;
  /** Current step: per task, other nodes its sent artifacts were taken from. */
  sources: Map<string, string[]>;
} {
  const artifacts = doc.artifacts ?? [];
  const byId = new Map(artifacts.map((a) => [a.id, a]));
  const tasks = new Map(doc.flow.tasks.map((t) => [t.id, t]));
  const places = initialPlaces(artifacts);
  let motions = new Map<string, ArtifactMotion>();
  let prev = new Set<string>();
  let before: ArtifactPlaces = new Map(places);
  let actionCount = 0;
  const sources = new Map<string, string[]>();
  steps.forEach((step, i) => {
    const last = i === steps.length - 1;
    if (last) before = new Map([...places].map(([k, v]) => [k, { ...v }]));
    motions = new Map();
    step.forEach((id) => {
      if (prev.has(id)) return;
      const t = tasks.get(id);
      if (t) applyTask(places, t, byId, last ? motions : undefined, last ? sources : undefined);
      if (t && last) actionCount = Math.max(actionCount, t.actions?.length ?? 0);
    });
    prev = new Set(step);
  });
  return { places, motions, before, actionCount, sources };
}
