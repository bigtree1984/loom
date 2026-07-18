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
  /** Pins this node's row within its lane — see ArchNode.rowOrder. */
  rowOrder?: number;
}

const TYPE_FALLBACK_ORDER: ArchNodeType[] = ["frontend", "backend", "agent", "storage", "spacer"];
export const HUMAN_LANE = "__human__";

/** Beyond this many lanes, exhaustive permutation search (n!) is dropped
 * for a greedy-construction + 2-opt local search instead. 8! = 40320, well
 * within a single render's budget; realistic lane counts rarely exceed
 * 5-6 anyway. */
const EXACT_PERMUTATION_LANE_LIMIT = 8;

/** Sum, over every pair of lanes, of (edges between them) * (how many
 * lane-slots apart they are). Edges between adjacent lanes are free-ish;
 * edges that have to jump over several lanes cost more — minimizing this
 * is what pulls heavily-connected lanes next to each other. */
function laneOrderCost(order: string[], weight: Map<string, Map<string, number>>): number {
  const indexOf = new Map(order.map((key, i) => [key, i]));
  let cost = 0;
  weight.forEach((inner, a) => {
    inner.forEach((w, b) => {
      if (a >= b) return; // each unordered pair counted once (weight is stored symmetrically)
      const ia = indexOf.get(a);
      const ib = indexOf.get(b);
      if (ia === undefined || ib === undefined) return;
      cost += w * Math.abs(ia - ib);
    });
  });
  return cost;
}

function buildLaneWeights(
  edges: { a: string; b: string }[],
  laneKeyOfId: Map<string, string>,
): Map<string, Map<string, number>> {
  const weight = new Map<string, Map<string, number>>();
  const add = (a: string, b: string) => {
    const inner = weight.get(a) ?? new Map<string, number>();
    inner.set(b, (inner.get(b) ?? 0) + 1);
    weight.set(a, inner);
  };
  edges.forEach((e) => {
    const la = laneKeyOfId.get(e.a);
    const lb = laneKeyOfId.get(e.b);
    if (!la || !lb || la === lb) return;
    add(la, lb);
    add(lb, la);
  });
  return weight;
}

function allPermutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  const result: T[][] = [];
  items.forEach((item, i) => {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    allPermutations(rest).forEach((p) => result.push([item, ...p]));
  });
  return result;
}

function exactMinLaneOrder(lanes: string[], weight: Map<string, Map<string, number>>): string[] {
  let best = lanes;
  let bestCost = Infinity;
  allPermutations(lanes).forEach((perm) => {
    const cost = laneOrderCost(perm, weight);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  });
  return best;
}

/** Greedy construction (insert each remaining lane wherever it's
 * cheapest) followed by 2-opt swaps until no swap improves further —
 * doesn't guarantee the true optimum like exactMinLaneOrder, but scales
 * to lane counts where n! stops being reasonable. */
function heuristicMinLaneOrder(lanes: string[], weight: Map<string, Map<string, number>>): string[] {
  if (lanes.length <= 1) return lanes;
  const remaining = [...lanes];
  let order = [remaining.shift()!];
  while (remaining.length > 0) {
    let bestPos = 0;
    let bestCost = Infinity;
    remaining.forEach((lane, i) => {
      const cost = laneOrderCost([...order, lane], weight);
      if (cost < bestCost) {
        bestCost = cost;
        bestPos = i;
      }
    });
    order = [...order, remaining[bestPos]];
    remaining.splice(bestPos, 1);
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const swapped = [...order];
        [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
        if (laneOrderCost(swapped, weight) < laneOrderCost(order, weight)) {
          order = swapped;
          improved = true;
        }
      }
    }
  }
  return order;
}

/**
 * Decides the left-to-right lane order. An explicit `architecture.laneOrder`
 * always wins (author/UI override — see the lane-swap header buttons);
 * otherwise it's chosen automatically to minimize edges that have to jump
 * across multiple lanes (a small Minimum Linear Arrangement over lanes,
 * not individual nodes — there are only ever a handful of lanes, so this
 * stays cheap even though MinLA is NP-hard in general).
 */
export function optimizeLaneOrder(
  presentLanes: string[],
  edges: { a: string; b: string }[],
  laneKeyOfId: Map<string, string>,
  explicitOrder?: string[],
): string[] {
  if (explicitOrder && explicitOrder.length > 0) {
    const present = new Set(presentLanes);
    const knownFirst = explicitOrder.filter((key) => present.has(key));
    const knownSet = new Set(knownFirst);
    const extra = presentLanes.filter((key) => !knownSet.has(key));
    return [...knownFirst, ...extra];
  }
  if (presentLanes.length <= 1) return presentLanes;
  const weight = buildLaneWeights(edges, laneKeyOfId);
  return presentLanes.length <= EXACT_PERMUTATION_LANE_LIMIT
    ? exactMinLaneOrder(presentLanes, weight)
    : heuristicMinLaneOrder(presentLanes, weight);
}

export interface LaneLayoutResult {
  positions: Map<string, { x: number; y: number }>;
  /** Final resolved lane order (left to right) — same keys as ArchNode.group
   * plus the special "__human__" / "__type_{type}" ones, in display order. */
  laneOrder: string[];
  /** x coordinate of each lane, keyed the same way as laneOrder. */
  laneX: Map<string, number>;
  /** Vertical spacing between rows (node height + gap) — for snapping a
   * dragged node's y position to the nearest row index. */
  rowHeight: number;
  laneGap: number;
  nodeWidth: number;
}

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
  explicitLaneOrder?: string[],
): LaneLayoutResult {
  const { width, height } = options;
  const laneGap = options.laneGap ?? 96;
  const rowGap = options.rowGap ?? 24;

  // human is pulled into its own dedicated lane unconditionally — it's
  // the actor/trigger, not part of any pipeline-stage grouping, and this
  // is specifically what keeps it from ever colliding with a same-rank
  // pipeline node the way it used to under dagre. Its left-to-right
  // *position* is still subject to the same optimization as any other
  // lane, though — nothing pins it to an edge anymore.
  const laneKeyOf = (n: LaneNode) => (n.type === "human" ? HUMAN_LANE : (n.group ?? `__type_${n.type}`));

  // Nodes without an explicit group still need a predictable lane instead
  // of crashing or bunching at the origin — bucket them by type, in a
  // fixed canonical order.
  const typeFallbacksInUse = TYPE_FALLBACK_ORDER.map((t) => `__type_${t}`).filter((key) =>
    nodes.some((n) => laneKeyOf(n) === key),
  );
  const humanLaneInUse = nodes.some((n) => n.type === "human") ? [HUMAN_LANE] : [];
  // Unlike the type-fallback lanes above, a *declared* group (one the
  // author explicitly named in architecture.groups) always gets a lane,
  // even with zero nodes in it yet — otherwise there's no way to drop a
  // node into a newly-added lane, since it wouldn't exist to drop onto.
  // Seed order (only used to break ties deterministically, and as the
  // starting point for the heuristic search) — actual position is decided
  // by optimizeLaneOrder below.
  const seedOrder = [...humanLaneInUse, ...groupOrder, ...typeFallbacksInUse];

  const byLane = new Map<string, LaneNode[]>();
  const laneKeyOfId = new Map<string, string>();
  nodes.forEach((n) => {
    const key = laneKeyOf(n);
    laneKeyOfId.set(n.id, key);
    if (!seedOrder.includes(key)) seedOrder.push(key); // a group id used on a node but missing from architecture.groups
    const list = byLane.get(key);
    if (list) list.push(n);
    else byLane.set(key, [n]);
  });

  const finalLaneOrder = optimizeLaneOrder(seedOrder, edges, laneKeyOfId, explicitLaneOrder);
  const laneIndex = new Map(finalLaneOrder.map((key, i) => [key, i]));

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
  const rowOrderById = new Map(nodes.filter((n) => n.rowOrder !== undefined).map((n) => [n.id, n.rowOrder!]));

  // A manually-pinned rowOrder wins outright (same numeric scale as the
  // step-order below, so "put this at row 0" and "this happens to be the
  // first task" sort the same way); then definite order (this node is
  // where some pipeline step actually runs); otherwise average the order
  // of whichever neighbors already have one (e.g. an AI service used by
  // several scripts settles near their midpoint); nodes with no
  // resolvable neighbor at all still sort deterministically, just last.
  const sortKeyOf = (id: string): number => {
    const pinned = rowOrderById.get(id);
    if (pinned !== undefined) return pinned;
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

  const laneX = new Map(finalLaneOrder.map((key, i) => [key, i * (width + laneGap)]));

  return {
    positions,
    laneOrder: finalLaneOrder,
    laneX,
    rowHeight: height + rowGap,
    laneGap,
    nodeWidth: width,
  };
}

/** Which lane keys a node of this type could validly land in when dropped
 * from a drag: any declared group lane (open to all types), its own
 * type-fallback lane (`"__type_{type}"`), and the human lane only if it
 * actually is the human node — dropping a non-human node "into" the human
 * lane, or a storage node into the agent fallback lane, would otherwise
 * produce a group value that doesn't reproduce where it visually landed. */
export function validLaneKeysFor(nodeType: ArchNodeType, allLaneKeys: string[]): string[] {
  return allLaneKeys.filter((key) => {
    if (key === HUMAN_LANE) return nodeType === "human";
    if (key.startsWith("__type_")) return key === `__type_${nodeType}`;
    return true;
  });
}

/**
 * Nearest lane (by x) and row (by y, rounded to the row-height grid) for a
 * dropped node — the discrete "grid" a drag snaps to, so a manual nudge
 * can't produce a freeform pixel position that would fight the
 * automatic layout's overlap-free guarantee.
 */
export function snapPositionToLane(
  position: { x: number; y: number },
  laneOrder: string[],
  laneX: Map<string, number>,
  rowHeight: number,
): { laneKey: string; rowOrder: number } {
  let bestLane = laneOrder[0] ?? "";
  let bestDist = Infinity;
  laneOrder.forEach((key) => {
    const x = laneX.get(key) ?? 0;
    const dist = Math.abs(x - position.x);
    if (dist < bestDist) {
      bestDist = dist;
      bestLane = key;
    }
  });
  const rowOrder = rowHeight > 0 ? Math.max(0, Math.round(position.y / rowHeight)) : 0;
  return { laneKey: bestLane, rowOrder };
}
