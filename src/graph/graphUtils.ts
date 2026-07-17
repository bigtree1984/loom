export interface GraphEdge {
  from: string;
  to: string;
}

export function findRootId(nodeIds: string[], edges: GraphEdge[]): string {
  const hasIncoming = new Set(edges.map((e) => e.to));
  const root = nodeIds.find((id) => !hasIncoming.has(id));
  return root ?? nodeIds[0] ?? "";
}

/**
 * Classifies edges that close a cycle (e.g. a human-gate rejection routing
 * back to an earlier task, or a bidirectional pair in the architecture
 * graph) via DFS back-edge detection — the standard graph-theory
 * definition: an edge to a node still on the current DFS stack (an
 * ancestor), not merely one that was visited earlier (that's a normal
 * join, like two fork branches converging).
 *
 * These should be excluded from layout-graph input so the main acyclic
 * structure lays out cleanly, and rendered with a distinct path instead.
 */
export function findBackEdgeKeys(nodeIds: string[], edges: GraphEdge[]): Set<string> {
  const outgoing = new Map<string, GraphEdge[]>();
  edges.forEach((e) => {
    const list = outgoing.get(e.from) ?? [];
    list.push(e);
    outgoing.set(e.from, list);
  });

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const backEdges = new Set<string>();

  function visit(id: string) {
    visited.add(id);
    onStack.add(id);
    for (const e of outgoing.get(id) ?? []) {
      if (onStack.has(e.to)) {
        backEdges.add(`${e.from}::${e.to}`);
      } else if (!visited.has(e.to)) {
        visit(e.to);
      }
    }
    onStack.delete(id);
  }

  const root = findRootId(nodeIds, edges);
  if (root) visit(root);
  // Any node unreachable from the root still needs its outgoing edges
  // classified.
  nodeIds.forEach((id) => {
    if (!visited.has(id)) visit(id);
  });

  return backEdges;
}
