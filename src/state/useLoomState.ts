import { useCallback, useEffect, useMemo, useState } from "react";
import type { Connection, LoomDocument, Task } from "../types";
import { findBackEdgeKeys, findRootId } from "../graph/graphUtils";

export interface ArchNodeHighlight {
  role: "main" | "io";
  routeIndex: number;
}

export interface PendingDecision {
  taskId: string;
  taskLabel: string;
  options: { label: string; to: string; toLabel: string; isBackEdge: boolean }[];
}

/** joinTaskId -> ids of tasks that have already arrived at it (waiting for
 * the rest), or "bypass" for a loop-back re-entry, which always proceeds
 * immediately rather than joining the normal arrival count. */
type JoinArrivals = Record<string, string[] | "bypass">;

interface PositionSnapshot {
  position: string[];
  joinArrivals: JoinArrivals;
}

const AUTO_PLAY_INTERVAL_MS = 1800;

export function useLoomState(initialDoc: LoomDocument | null) {
  const [doc, setDoc] = useState<LoomDocument | null>(initialDoc);
  const [position, setPosition] = useState<string[]>([]);
  const [joinArrivals, setJoinArrivals] = useState<JoinArrivals>({});
  const [history, setHistory] = useState<PositionSnapshot[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  // One full snapshot per document change (upload, sample reload, or an
  // add/edit/delete from a modal) — the documents are small, so storing
  // whole copies instead of diffs is simplest and cheap.
  const [docHistory, setDocHistory] = useState<LoomDocument[]>([]);
  // Docs popped off by undoEdit, redone via redoEdit. Any *new* edit
  // (loadDocument) invalidates this branch, same as a normal undo/redo stack.
  const [docFuture, setDocFuture] = useState<LoomDocument[]>([]);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    doc?.flow.tasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [doc]);

  const archNodesById = useMemo(() => {
    const map = new Map<string, LoomDocument["architecture"]["nodes"][number]>();
    doc?.architecture.nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [doc]);

  const outgoingByTask = useMemo(() => {
    const map = new Map<string, Connection[]>();
    doc?.flow.connections.forEach((c) => {
      const list = map.get(c.from) ?? [];
      list.push(c);
      map.set(c.from, list);
    });
    return map;
  }, [doc]);

  const incomingByTask = useMemo(() => {
    const map = new Map<string, Connection[]>();
    doc?.flow.connections.forEach((c) => {
      const list = map.get(c.to) ?? [];
      list.push(c);
      map.set(c.to, list);
    });
    return map;
  }, [doc]);

  // Cycle-forming connections (loop-backs, e.g. a rejection routing back
  // to an earlier task) — needed below to keep them out of join-arrival
  // accounting, and again later to sort/mark decision options.
  const backEdgeKeys = useMemo(() => {
    if (!doc) return new Set<string>();
    return findBackEdgeKeys(doc.flow.tasks.map((t) => t.id), doc.flow.connections);
  }, [doc]);

  // How many arrivals a task actually needs before it can proceed. Raw
  // incoming-edge count over-counts in two ways:
  //  - t4a in the sample has an edge from both t3a and t3b, but those are
  //    mutually-exclusive alternatives of the SAME decision (t2), not two
  //    parallel branches that must both complete — only one of them will
  //    ever fire, so 1 arrival suffices. A predecessor only adds an
  //    independent requirement when it's reached by a plain (unlabeled/
  //    fork) edge; predecessors reached via the same decision's labeled
  //    edges collapse into a single shared requirement.
  //  - a loop-back (e.g. t7 "差し戻し" back to t5) is a deliberate re-entry,
  //    not a parallel contributor, so it's excluded entirely — see the
  //    "bypass" handling in advance() below for how it's actually let in.
  const requiredArrivalsByTask = useMemo(() => {
    const map = new Map<string, number>();
    if (!doc) return map;
    const decisionSourceOf = (taskId: string): string | null => {
      const labeledIncoming = (incomingByTask.get(taskId) ?? []).find((c) => !!c.label);
      return labeledIncoming ? labeledIncoming.from : null;
    };
    doc.flow.tasks.forEach((t) => {
      const decisionGroups = new Set<string>();
      let independent = 0;
      (incomingByTask.get(t.id) ?? []).forEach((c) => {
        if (backEdgeKeys.has(`${c.from}::${c.to}`)) return;
        const decisionSource = decisionSourceOf(c.from);
        if (decisionSource) decisionGroups.add(decisionSource);
        else independent++;
      });
      map.set(t.id, decisionGroups.size + independent);
    });
    return map;
  }, [doc, incomingByTask, backEdgeKeys]);

  /** A task that genuinely needs 2+ independent arrivals is a join — it
   * must wait for all of them before it can advance any further. */
  const isJoinTask = useCallback(
    (taskId: string) => (requiredArrivalsByTask.get(taskId) ?? 0) >= 2,
    [requiredArrivalsByTask],
  );

  const isWaitingJoin = useCallback(
    (taskId: string) => {
      if (!isJoinTask(taskId)) return false;
      const entry = joinArrivals[taskId];
      if (entry === "bypass") return false;
      const required = requiredArrivalsByTask.get(taskId) ?? 0;
      const arrived = entry?.length ?? 0;
      return arrived < required;
    },
    [isJoinTask, requiredArrivalsByTask, joinArrivals],
  );

  const resetTo = useCallback((rootId: string) => {
    setPosition(rootId ? [rootId] : []);
    setJoinArrivals({});
    setHistory([]);
    setIsPlaying(false);
  }, []);

  const loadDocument = useCallback(
    (next: LoomDocument) => {
      if (doc) {
        setDocHistory((h) => [...h, doc]);
      }
      setDocFuture([]); // a fresh edit invalidates whatever redo branch existed
      setDoc(next);
      resetTo(findRootId(next.flow.tasks.map((t) => t.id), next.flow.connections));
    },
    [doc, resetTo],
  );

  const canUndoEdit = docHistory.length > 0;
  const canRedoEdit = docFuture.length > 0;

  /** Steps the whole document back to before the last upload/sample-load/
   * modal edit — separate from `goBack`, which only rewinds the current
   * step-through position within a single document. */
  const undoEdit = useCallback(() => {
    if (docHistory.length === 0) return;
    const prev = docHistory[docHistory.length - 1];
    setDocHistory((h) => h.slice(0, -1));
    if (doc) setDocFuture((f) => [...f, doc]);
    setDoc(prev);
    resetTo(findRootId(prev.flow.tasks.map((t) => t.id), prev.flow.connections));
  }, [doc, docHistory, resetTo]);

  /** Re-applies a document undoEdit just stepped back from. */
  const redoEdit = useCallback(() => {
    if (docFuture.length === 0) return;
    const next = docFuture[docFuture.length - 1];
    setDocFuture((f) => f.slice(0, -1));
    if (doc) setDocHistory((h) => [...h, doc]);
    setDoc(next);
    resetTo(findRootId(next.flow.tasks.map((t) => t.id), next.flow.connections));
  }, [doc, docFuture, resetTo]);

  useEffect(() => {
    if (initialDoc) {
      resetTo(findRootId(initialDoc.flow.tasks.map((t) => t.id), initialDoc.flow.connections));
    }
    // Only seed once on mount; loadDocument handles later swaps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A join that's still waiting on other branches hasn't actually started
  // yet — it's excluded from what's displayed as "current" so it doesn't
  // read as busy/active before it's really ready to run.
  const displayPosition = useMemo(() => position.filter((id) => !isWaitingJoin(id)), [position, isWaitingJoin]);

  const currentTasks = useMemo(
    () => displayPosition.map((id) => tasksById.get(id)).filter((t): t is Task => !!t),
    [displayPosition, tasksById],
  );

  // Stable per-route color assignment (by position in displayPosition) so
  // the same branch keeps the same color across the process-flow,
  // architecture, and task-detail panels while it's simultaneously active
  // with others.
  const routeColorByTask = useMemo(() => {
    const map = new Map<string, number>();
    displayPosition.forEach((id, i) => map.set(id, i));
    return map;
  }, [displayPosition]);

  const pendingDecisions = useMemo<PendingDecision[]>(() => {
    return displayPosition
      .map((taskId) => {
        const outs = outgoingByTask.get(taskId) ?? [];
        const labeled = outs.filter((o) => !!o.label);
        if (labeled.length === 0) return null;
        const sorted = [...labeled].sort((a, b) => {
          const aBack = backEdgeKeys.has(`${a.from}::${a.to}`) ? 0 : 1;
          const bBack = backEdgeKeys.has(`${b.from}::${b.to}`) ? 0 : 1;
          return aBack - bBack;
        });
        return {
          taskId,
          taskLabel: tasksById.get(taskId)?.label ?? taskId,
          options: sorted.map((o) => ({
            label: o.label!,
            to: o.to,
            toLabel: tasksById.get(o.to)?.label ?? o.to,
            isBackEdge: backEdgeKeys.has(`${o.from}::${o.to}`),
          })),
        };
      })
      .filter((d): d is PendingDecision => !!d);
  }, [displayPosition, outgoingByTask, tasksById, backEdgeKeys]);

  const isComplete = useMemo(
    () => position.length > 0 && position.every((id) => (outgoingByTask.get(id) ?? []).length === 0),
    [position, outgoingByTask],
  );

  const advance = useCallback(
    (choices?: Record<string, string>) => {
      const nextTargets: string[] = [];
      const nextArrivals: JoinArrivals = {};
      Object.entries(joinArrivals).forEach(([k, v]) => {
        nextArrivals[k] = v === "bypass" ? "bypass" : [...v];
      });

      for (const taskId of position) {
        // A join that hasn't collected every one of its incoming branches
        // yet just waits in place this step, instead of racing ahead on
        // whichever branch happened to arrive first. A "bypass" entry
        // (a loop-back re-entry) always counts as satisfied.
        if (isJoinTask(taskId)) {
          const entry = nextArrivals[taskId];
          if (entry !== "bypass") {
            const required = requiredArrivalsByTask.get(taskId) ?? 0;
            const arrived = entry?.length ?? 0;
            if (arrived < required) {
              nextTargets.push(taskId);
              continue;
            }
          }
        }

        const outs = outgoingByTask.get(taskId) ?? [];
        if (outs.length === 0) continue; // terminal, drops out
        const hasLabels = outs.some((o) => !!o.label);
        let targets: string[];
        if (hasLabels) {
          const chosenTo = choices?.[taskId];
          if (!chosenTo) {
            // Decision still unresolved — cannot advance this task yet.
            nextTargets.push(taskId);
            continue;
          }
          targets = [chosenTo];
        } else {
          targets = outs.map((o) => o.to);
        }

        delete nextArrivals[taskId]; // this task (if it was a join) has now been left behind

        targets.forEach((t) => {
          if (isJoinTask(t)) {
            // A loop-back into a join is a deliberate single re-entry, not
            // a parallel contributor — it bypasses the normal arrival
            // count entirely rather than waiting for siblings that were
            // never going to show up again.
            if (backEdgeKeys.has(`${taskId}::${t}`)) {
              nextArrivals[t] = "bypass";
            } else {
              const arrivedFrom = nextArrivals[t];
              const arr = arrivedFrom === "bypass" ? [] : (arrivedFrom ?? []);
              if (!arr.includes(taskId)) {
                nextArrivals[t] = [...arr, taskId];
              }
            }
          }
          nextTargets.push(t);
        });
      }

      const deduped = Array.from(new Set(nextTargets));
      const positionUnchanged = deduped.length === position.length && deduped.every((id, i) => id === position[i]);
      const arrivalsUnchanged = JSON.stringify(nextArrivals) === JSON.stringify(joinArrivals);
      if (deduped.length === 0 || (positionUnchanged && arrivalsUnchanged)) {
        return;
      }
      setHistory((h) => [...h, { position, joinArrivals }]);
      setPosition(deduped);
      setJoinArrivals(nextArrivals);
    },
    [position, joinArrivals, outgoingByTask, requiredArrivalsByTask, isJoinTask, backEdgeKeys],
  );

  const choose = useCallback(
    (taskId: string, to: string) => {
      advance({ [taskId]: to });
    },
    [advance],
  );

  const goNext = useCallback(() => {
    if (pendingDecisions.length > 0) return; // must use `choose`
    advance();
  }, [advance, pendingDecisions]);

  const canGoBack = history.length > 0;

  const goBack = useCallback(() => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setPosition(prev.position);
      setJoinArrivals(prev.joinArrivals);
      return h.slice(0, -1);
    });
    setIsPlaying(false);
  }, []);

  /** Jump directly to any task, visited or not (clicking it in the flow panel).
   * Resets join-arrival bookkeeping — free-jumping bypasses the normal
   * token flow, so there's no principled way to know which branches
   * would have "arrived" at a join reached this way. */
  const jumpTo = useCallback(
    (taskId: string) => {
      if (!tasksById.has(taskId)) return;
      if (position.length === 1 && position[0] === taskId) return;
      setHistory((h) => [...h, { position, joinArrivals }]);
      setPosition([taskId]);
      setJoinArrivals({});
      setIsPlaying(false);
    },
    [tasksById, position, joinArrivals],
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
  }, []);

  // Auto-play: advance on an interval, stopping only once there's nowhere
  // left to go. At a decision it auto-resolves by picking that decision's
  // last option — the same one the fixed bottom slot in the control bar
  // shows, i.e. whichever isn't a loop-back (see the sort in
  // `pendingDecisions` above) — so it always makes forward progress
  // instead of ever picking a rejection/loop-back option.
  useEffect(() => {
    if (!isPlaying) return;
    if (isComplete) {
      setIsPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const decision = pendingDecisions[0];
      if (decision) {
        const defaultOption = decision.options[decision.options.length - 1];
        choose(decision.taskId, defaultOption.to);
      } else {
        goNext();
      }
    }, AUTO_PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, position, pendingDecisions, isComplete, goNext, choose]);

  // Main-node claims are resolved first (across all currently active
  // tasks) so a node never loses its stronger "main" highlight to a
  // weaker "io" claim from a different simultaneous task. currentTasks is
  // ordered by ascending routeIndex, so the first main claim on a given
  // node is already the lowest routeIndex — a later task sharing the same
  // mainNode (e.g. two parallel branches on one shared service) must not
  // overwrite it.
  const highlightedArchNodes = useMemo(() => {
    const map = new Map<string, ArchNodeHighlight>();
    currentTasks.forEach((t) => {
      if (map.get(t.mainNode)?.role === "main") return;
      const routeIndex = routeColorByTask.get(t.id) ?? 0;
      map.set(t.mainNode, { role: "main", routeIndex });
    });
    currentTasks.forEach((t) => {
      const routeIndex = routeColorByTask.get(t.id) ?? 0;
      [...t.inputNodes, ...t.outputNodes].forEach((n) => {
        if (!map.has(n)) map.set(n, { role: "io", routeIndex });
      });
    });
    return map;
  }, [currentTasks, routeColorByTask]);

  const isHumanGate = useMemo(
    () => currentTasks.some((t) => archNodesById.get(t.mainNode)?.type === "human"),
    [currentTasks, archNodesById],
  );

  return {
    doc,
    loadDocument,
    canUndoEdit,
    undoEdit,
    canRedoEdit,
    redoEdit,
    position,
    displayPosition,
    currentTasks,
    history,
    canGoBack,
    goBack,
    jumpTo,
    pendingDecisions,
    choose,
    goNext,
    isPlaying,
    togglePlay,
    isComplete,
    isHumanGate,
    highlightedArchNodes,
    routeColorByTask,
    archNodesById,
  };
}
