import type { Task } from "../types";

/** How data moves between a task's main node and one of its io nodes:
 * "in" = an input (io -> main), "out" = an output (main -> io), "both". */
export type IoFlow = "in" | "out" | "both";

export interface NodeHighlight {
  role: "main" | "io";
  routeIndex: number;
  /** io nodes only. */
  flow?: IoFlow;
}

/** Add one task's io nodes to a highlight map (main nodes already set).
 * A node that is both an input and an output of the task gets "both". */
export function addIoHighlights(map: Map<string, NodeHighlight>, t: Task, routeIndex: number) {
  const ins = new Set(t.inputNodes);
  const outs = new Set(t.outputNodes);
  [...new Set([...t.inputNodes, ...t.outputNodes])].forEach((n) => {
    if (map.has(n)) return;
    const flow: IoFlow = ins.has(n) && outs.has(n) ? "both" : ins.has(n) ? "in" : "out";
    map.set(n, { role: "io", routeIndex, flow });
  });
}

/** Which way the current task's data runs along an architecture edge,
 * relative to the edge's stored from -> to — decided by the task's
 * input/output settings, never by the edge's own arrow. null when the edge
 * isn't between a route's main node and one of its io nodes. */
export function activeEdgeFlow(
  from: NodeHighlight | undefined,
  to: NodeHighlight | undefined,
): { routeIndex: number; dir: "forward" | "backward" | "both" } | null {
  if (!from || !to || from.routeIndex !== to.routeIndex) return null;
  let io: NodeHighlight;
  let mainIsFrom: boolean;
  if (from.role === "main" && to.role === "io") [io, mainIsFrom] = [to, true];
  else if (to.role === "main" && from.role === "io") [io, mainIsFrom] = [from, false];
  else return null;
  const flow = io.flow ?? "both";
  if (flow === "both") return { routeIndex: from.routeIndex, dir: "both" };
  // "out" runs main -> io; "in" runs io -> main.
  const mainToIo = flow === "out";
  return { routeIndex: from.routeIndex, dir: mainToIo === mainIsFrom ? "forward" : "backward" };
}
