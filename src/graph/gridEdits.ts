import type { ArchColumn, LoomDocument } from "../types";
import { drawnLanes, memberships, placeMembers, tierOf } from "./lanes";

/**
 * Pure edit operations on a normalized (v2) document's grid. Each returns
 * a new document; the caller feeds it back through loadDocument (which
 * re-normalizes, so collisions can't survive even if one slipped through).
 */

type Arch = LoomDocument["architecture"];

function withArch(doc: LoomDocument, arch: Partial<Arch>): LoomDocument {
  return { ...doc, architecture: { ...doc.architecture, ...arch } };
}

/** Lanes (headed or not) as real columns, so every lane can be moved:
 * header-less columns some node sits in get a blank header. */
function materialized(arch: Arch): { columns: ArchColumn[]; members: ReturnType<typeof memberships> } {
  const members = memberships(arch);
  const columns = [...arch.columns];
  const used = new Set(columns.map((c) => c.id));
  const rename = new Map<string, string>();
  drawnLanes(arch)
    .filter((l) => l.virtual)
    .sort((x, y) => x.tier - y.tier || x.startCol - y.startCol)
    .forEach((l) => {
      let id = `col_${columns.length}`;
      while (used.has(id)) id += "_";
      used.add(id);
      rename.set(l.id, id);
      columns.push({ id, label: "", ...(l.tier === 1 ? { tier: "bottom" as const } : {}) });
    });
  members.forEach((m, k) => rename.has(m.lane) && members.set(k, { ...m, lane: rename.get(m.lane)! }));
  return { columns, members };
}

/** Swap lane `i` with the next lane in the same tier, nodes travelling with
 * their lanes. */
export function swapColumns(doc: LoomDocument, i: number): LoomDocument {
  const { columns, members } = materialized(doc.architecture);
  if (i < 0 || !columns[i]) return doc;
  const j = columns.findIndex((c, k) => k > i && tierOf(c) === tierOf(columns[i]));
  if (j < 0) return doc;
  const next = [...columns];
  [next[i], next[j]] = [next[j], next[i]];
  return withArch(doc, placeMembers(doc.architecture, next, members));
}

/** Move lane `id` into `tier` at position `index` among that tier's lanes
 * (nodes travel with it; it can't straddle the tiers). */
export function moveLane(doc: LoomDocument, id: string, tier: 0 | 1, index: number): LoomDocument {
  const { columns, members } = materialized(doc.architecture);
  const lane = columns.find((c) => c.id === id);
  if (!lane) return doc;
  const moved: ArchColumn = { ...lane };
  if (tier === 1) moved.tier = "bottom";
  else delete moved.tier;
  const rest = columns.filter((c) => c.id !== id);
  const top = rest.filter((c) => tierOf(c) === 0);
  const bottom = rest.filter((c) => tierOf(c) === 1);
  const target = tier === 0 ? top : bottom;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, moved);
  members.forEach((m, k) => m.lane === id && members.set(k, { ...m, tier }));
  return withArch(doc, placeMembers(doc.architecture, [...top, ...bottom], members));
}

/** Old index-based reorder (top tier, 1-wide lanes): kept for callers that
 * think in column indexes. */
export function moveColumn(doc: LoomDocument, from: number, to: number): LoomDocument {
  const { columns } = materialized(doc.architecture);
  const lane = columns[from];
  if (!lane || from === to) return doc;
  const tier = tierOf(lane);
  const sameTier = columns.filter((c) => tierOf(c) === tier && c.id !== lane.id);
  const target = columns[to];
  const index = target ? sameTier.findIndex((c) => c.id === target.id) + (to > from ? 1 : 0) : sameTier.length;
  return moveLane(doc, lane.id, tier, index);
}

/** Lane width 1 or 2. Narrowing folds the second column into the first;
 * nodes that would meet are pushed down. */
export function setLaneWidth(doc: LoomDocument, id: string, width: 1 | 2): LoomDocument {
  const { columns, members } = materialized(doc.architecture);
  const next = columns.map((c) => {
    if (c.id !== id) return c;
    const { width: _w, ...rest } = c;
    return width === 2 ? { ...rest, width: 2 as const } : rest;
  });
  return withArch(doc, placeMembers(doc.architecture, next, members));
}

/** Move a node to a cell. If another node is there, the two trade places. */
export function moveNodeToCell(doc: LoomDocument, nodeId: string, col: number, row: number): LoomDocument {
  const a = doc.architecture;
  const moving = a.nodes.find((n) => n.id === nodeId);
  if (!moving || (moving.col === col && moving.row === row)) return doc;
  const occupant = a.nodes.find((n) => n.id !== nodeId && n.col === col && n.row === row);
  const nodes = a.nodes.map((n) => {
    if (n.id === nodeId) return { ...n, col, row };
    if (occupant && n.id === occupant.id) return { ...n, col: moving.col, row: moving.row };
    return n;
  });
  return withArch(doc, { nodes });
}

/** Append a headed, empty lane at the right end of the top tier. */
export function addColumn(doc: LoomDocument, column: ArchColumn): LoomDocument {
  const { columns, members } = materialized(doc.architecture);
  const top = columns.filter((c) => tierOf(c) === 0);
  const bottom = columns.filter((c) => tierOf(c) === 1);
  return withArch(doc, placeMembers(doc.architecture, [...top, column, ...bottom], members));
}

export function renameColumn(doc: LoomDocument, id: string, label: string): LoomDocument {
  return withArch(doc, { columns: doc.architecture.columns.map((c) => (c.id === id ? { ...c, label } : c)) });
}

/** Remove an empty lane; the lanes after it in its tier close the gap.
 * Returns null if the lane still has nodes. */
export function removeColumn(doc: LoomDocument, id: string): LoomDocument | null {
  if (nodesInColumn(doc, id) > 0) return null;
  const { columns, members } = materialized(doc.architecture);
  if (!columns.some((c) => c.id === id)) return doc;
  return withArch(doc, placeMembers(doc.architecture, columns.filter((c) => c.id !== id), members));
}

export function nodesInColumn(doc: LoomDocument, id: string): number {
  return [...memberships(doc.architecture).values()].filter((m) => m.lane === id).length;
}

/** Add an edge from -> to. Self-loops and exact duplicates are ignored; if
 * the reverse edge already exists it becomes two-way instead. */
export function addEdge(doc: LoomDocument, from: string, to: string): LoomDocument {
  const a = doc.architecture;
  if (from === to) return doc;
  if (a.edges.some((e) => (e.from === from && e.to === to) || ((e.bidirectional || e.undirected) && e.from === to && e.to === from)))
    return doc;
  const reverse = a.edges.findIndex((e) => e.from === to && e.to === from);
  if (reverse >= 0) return withArch(doc, { edges: a.edges.map((e, i) => (i === reverse ? { ...e, bidirectional: true } : e)) });
  return withArch(doc, { edges: [...a.edges, { from, to }] });
}

export function removeEdgeAt(doc: LoomDocument, index: number): LoomDocument {
  return withArch(doc, { edges: doc.architecture.edges.filter((_, i) => i !== index) });
}

/** Flip an edge's direction (a two-way edge stays two-way). */
export function reverseEdgeAt(doc: LoomDocument, index: number): LoomDocument {
  return withArch(doc, {
    edges: doc.architecture.edges.map((e, i) => (i === index ? { ...e, from: e.to, to: e.from } : e)),
  });
}

export type EdgeDirection = "forward" | "backward" | "both" | "none";

/** Set an edge's arrow style. "backward" flips from/to so the stored edge
 * stays a plain directed one. */
export function setEdgeDirectionAt(doc: LoomDocument, index: number, dir: EdgeDirection): LoomDocument {
  return withArch(doc, {
    edges: doc.architecture.edges.map((e, i) => {
      if (i !== index) return e;
      const { bidirectional: _b, undirected: _u, ...rest } = e;
      if (dir === "backward") return { ...rest, from: e.to, to: e.from };
      if (dir === "both") return { ...rest, bidirectional: true };
      if (dir === "none") return { ...rest, undirected: true };
      return rest;
    }),
  });
}

export function edgeDirectionOf(e: { bidirectional?: boolean; undirected?: boolean }): Exclude<EdgeDirection, "backward"> {
  return e.undirected ? "none" : e.bidirectional ? "both" : "forward";
}
