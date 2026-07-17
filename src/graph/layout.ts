import dagre from "@dagrejs/dagre";
import type { ArchNodeType } from "../types";

export interface LayoutEdge {
  source: string;
  target: string;
}

/**
 * Rank = longest path from a source (Kahn's algorithm), i.e. the
 * earliest rank a node can possibly have. dagre's own rankers (including
 * the one literally named "longest-path") actually assign ranks as-late-
 * as-possible — they walk backward from sinks — which pulls a fork's
 * shorter branch down toward wherever it eventually joins instead of
 * aligning it with its sibling right after the fork.
 */
export function computeAsapRanks(nodeIds: string[], edges: LayoutEdge[]): Map<string, number> {
  const outgoing = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  nodeIds.forEach((id) => {
    outgoing.set(id, []);
    indegree.set(id, 0);
  });
  edges.forEach((e) => {
    if (!outgoing.has(e.source) || !indegree.has(e.target)) return;
    outgoing.get(e.source)!.push(e.target);
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1);
  });

  const ranks = new Map<string, number>();
  const queue = nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  queue.forEach((id) => ranks.set(id, 0));

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    const rank = ranks.get(id) ?? 0;
    outgoing.get(id)!.forEach((next) => {
      ranks.set(next, Math.max(ranks.get(next) ?? 0, rank + 1));
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    });
  }

  return ranks;
}

/**
 * Flattens computeAsapRanks into a single total order (0..n-1): sorted by
 * rank, then by original array position within a rank for stability. Used
 * wherever a plain "which comes first" signal is needed instead of a
 * rank/column number — e.g. the architecture lane layout orders each lane's
 * rows by this sequence rather than by raw rank, since ranks alone would
 * collapse a fork's parallel branches onto the same index.
 */
export function computeStableOrder(nodeIds: string[], edges: LayoutEdge[]): Map<string, number> {
  const ranks = computeAsapRanks(nodeIds, edges);
  const withRank = nodeIds.map((id, i) => ({ id, rank: ranks.get(id) ?? 0, i }));
  withRank.sort((a, b) => a.rank - b.rank || a.i - b.i);
  const order = new Map<string, number>();
  withRank.forEach(({ id }, idx) => order.set(id, idx));
  return order;
}

/**
 * A minimal from-scratch layered layout (ranks from computeAsapRanks,
 * ordered within each rank by a single-pass barycenter over the previous
 * rank) — used instead of feeding precomputed ranks back into dagre,
 * because this dagre build's `ranker: "none"` path crashes internally
 * when ranks are supplied externally.
 */
function computeAsapLayout(
  nodeIds: string[],
  edges: LayoutEdge[],
  width: number,
  height: number,
  nodesep: number,
  ranksep: number,
): Map<string, { x: number; y: number }> {
  const ranks = computeAsapRanks(nodeIds, edges);
  const maxRank = Math.max(0, ...nodeIds.map((id) => ranks.get(id) ?? 0));
  const byRank: string[][] = Array.from({ length: maxRank + 1 }, () => []);
  nodeIds.forEach((id) => byRank[ranks.get(id) ?? 0].push(id));

  const incoming = new Map<string, string[]>();
  nodeIds.forEach((id) => incoming.set(id, []));
  edges.forEach((e) => {
    if (incoming.has(e.target)) incoming.get(e.target)!.push(e.source);
  });

  const orderIndex = new Map<string, number>();
  byRank.forEach((ids, rank) => {
    if (rank === 0) {
      ids.forEach((id, i) => orderIndex.set(id, i));
      return;
    }
    const withKey = ids.map((id, i) => {
      const predOrders = (incoming.get(id) ?? [])
        .map((p) => orderIndex.get(p))
        .filter((v): v is number => v !== undefined);
      const key = predOrders.length > 0 ? predOrders.reduce((a, b) => a + b, 0) / predOrders.length : i;
      return { id, key, i };
    });
    withKey.sort((a, b) => a.key - b.key || a.i - b.i);
    withKey.forEach(({ id }, i) => orderIndex.set(id, i));
  });

  const positions = new Map<string, { x: number; y: number }>();
  byRank.forEach((ids, rank) => {
    const sorted = [...ids].sort((a, b) => (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0));
    const totalWidth = sorted.length * width + Math.max(0, sorted.length - 1) * nodesep;
    const startX = -totalWidth / 2;
    sorted.forEach((id, i) => {
      positions.set(id, { x: startX + i * (width + nodesep), y: rank * (height + ranksep) });
    });
  });

  return positions;
}

/** Runs dagre (or the ASAP layered layout above) over a plain id/edge
 * list and returns top-left React Flow positions. */
export function layoutWithDagre(
  nodeIds: string[],
  edges: LayoutEdge[],
  options: {
    direction: "LR" | "TB";
    width: number;
    height: number;
    nodesep?: number;
    ranksep?: number;
    /** Align parallel branches at the earliest shared rank instead of
     * dagre's default of packing slack nodes toward wherever they
     * converge. */
    asapRanks?: boolean;
  },
): Map<string, { x: number; y: number }> {
  const nodesep = options.nodesep ?? 32;
  const ranksep = options.ranksep ?? 64;

  if (options.asapRanks) {
    return computeAsapLayout(nodeIds, edges, options.width, options.height, nodesep, ranksep);
  }

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: options.direction, nodesep, ranksep });

  nodeIds.forEach((id) => g.setNode(id, { width: options.width, height: options.height }));
  edges.forEach((e) => {
    if (nodeIds.includes(e.source) && nodeIds.includes(e.target)) {
      g.setEdge(e.source, e.target);
    }
  });

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  nodeIds.forEach((id) => {
    const n = g.node(id);
    positions.set(id, { x: n.x - options.width / 2, y: n.y - options.height / 2 });
  });
  return positions;
}

export interface LaneNode {
  id: string;
  type: ArchNodeType;
  group?: string;
}

const TYPE_FALLBACK_ORDER: ArchNodeType[] = ["frontend", "backend", "agent", "storage"];
const HUMAN_LANE = "__human__";

/**
 * Architecture layout as columns ("lanes") instead of dagre-ranked
 * columns: dagre packs nodes purely by edge topology, which scatters
 * same-category nodes (e.g. BigQuery and GCS ending up in unrelated
 * columns) and can even collapse unrelated nodes onto the same
 * coordinates when neither has an edge constraining it relative to the
 * other (e.g. a human-gate node landing on top of an unrelated source
 * node — both have no incoming edge, so dagre has nothing to separate
 * them by).
 *
 * Lanes fix this by deciding columns from `group` up front (author
 * intent, not incidental edge shape) and reducing the vertical problem to
 * a 1-D sort within each lane — which can't overlap by construction,
 * since rows are stacked sequentially rather than positioned by
 * continuous coordinates.
 */
export function layoutByLanes(
  nodes: LaneNode[],
  edges: { a: string; b: string }[],
  groupOrder: string[],
  taskOrderByNode: Map<string, number>,
  options: { width: number; height: number; laneGap?: number; rowGap?: number },
): Map<string, { x: number; y: number }> {
  const { width, height } = options;
  const laneGap = options.laneGap ?? 96;
  const rowGap = options.rowGap ?? 24;

  // human is pulled into its own dedicated lane unconditionally — it's
  // the actor/trigger, not part of any pipeline-stage grouping, and this
  // is specifically what keeps it from ever colliding with a same-rank
  // pipeline node the way it used to under dagre.
  const laneKeyOf = (n: LaneNode) => (n.type === "human" ? HUMAN_LANE : (n.group ?? `__type_${n.type}`));

  // Nodes without an explicit group still need a predictable lane instead
  // of crashing or bunching at the origin — bucket them by type, in a
  // fixed canonical order, appended after the JSON's declared groups.
  const typeFallbacksInUse = TYPE_FALLBACK_ORDER.map((t) => `__type_${t}`).filter((key) =>
    nodes.some((n) => laneKeyOf(n) === key),
  );
  const laneOrder = [HUMAN_LANE, ...groupOrder, ...typeFallbacksInUse];
  const laneIndex = new Map(laneOrder.map((key, i) => [key, i]));

  const byLane = new Map<string, LaneNode[]>();
  nodes.forEach((n) => {
    const key = laneKeyOf(n);
    if (!laneIndex.has(key)) {
      // A group id referenced on a node but missing from
      // architecture.groups — give it its own trailing lane rather than
      // dropping the node.
      laneIndex.set(key, laneOrder.length);
      laneOrder.push(key);
    }
    const list = byLane.get(key);
    if (list) list.push(n);
    else byLane.set(key, [n]);
  });

  const neighborsOf = new Map<string, string[]>();
  edges.forEach((e) => {
    const na = neighborsOf.get(e.a);
    if (na) na.push(e.b);
    else neighborsOf.set(e.a, [e.b]);
    const nb = neighborsOf.get(e.b);
    if (nb) nb.push(e.a);
    else neighborsOf.set(e.b, [e.a]);
  });
  const declarationIndex = new Map(nodes.map((n, i) => [n.id, i]));

  // Definite order (this node is where some pipeline step actually runs)
  // wins; otherwise average the order of whichever neighbors already have
  // one (e.g. an AI service used by several scripts settles near their
  // midpoint); nodes with no resolvable neighbor at all still sort
  // deterministically, just last.
  const sortKeyOf = (id: string): number => {
    const definite = taskOrderByNode.get(id);
    if (definite !== undefined) return definite;
    const neighborOrders = (neighborsOf.get(id) ?? [])
      .map((nb) => taskOrderByNode.get(nb))
      .filter((v): v is number => v !== undefined);
    if (neighborOrders.length > 0) {
      return neighborOrders.reduce((a, b) => a + b, 0) / neighborOrders.length;
    }
    return 100000 + (declarationIndex.get(id) ?? 0);
  };

  const positions = new Map<string, { x: number; y: number }>();
  const laneHeights = new Map<string, number>();

  byLane.forEach((laneNodes, key) => {
    const sorted = [...laneNodes].sort((a, b) => sortKeyOf(a.id) - sortKeyOf(b.id) || a.id.localeCompare(b.id));
    const x = (laneIndex.get(key) ?? 0) * (width + laneGap);
    sorted.forEach((n, row) => {
      positions.set(n.id, { x, y: row * (height + rowGap) });
    });
    laneHeights.set(key, sorted.length * height + Math.max(0, sorted.length - 1) * rowGap);
  });

  // Vertically center every lane against the tallest one so a short lane
  // (a lone human node) doesn't hug the top while a long one extends well
  // below it.
  const maxHeight = Math.max(0, ...Array.from(laneHeights.values()));
  byLane.forEach((laneNodes, key) => {
    const offset = (maxHeight - (laneHeights.get(key) ?? 0)) / 2;
    laneNodes.forEach((n) => {
      const p = positions.get(n.id);
      if (p) positions.set(n.id, { x: p.x, y: p.y + offset });
    });
  });

  return positions;
}
