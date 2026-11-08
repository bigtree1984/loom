import type { ArchColumn, ArchNode, LoomDocument } from "../types";

/**
 * Two-dimensional lanes (DESIGN_v2 §13).
 *
 * Nodes keep absolute grid cells (col, row) — rendering, edges and edits
 * all work on those. Lanes are rectangles laid over the grid:
 *  - a lane is 1 or 2 columns wide (`ArchColumn.width`);
 *  - lanes sit in the top tier, or in the bottom tier (`tier: "bottom"`);
 *    each tier packs its lanes left to right from column 0 (left-aligned),
 *    so the two tiers' lane borders need not line up;
 *  - the top tier is rows [0, topHeight); the bottom tier starts right
 *    below it, at `split` (its lane headers are drawn under it).
 *  - each tier's height follows the nodes in it (auto).
 *
 * `architecture.split` (first row of the bottom tier) is stored only so the
 * tier of a node can be read back from its row; settleLanes recomputes it
 * after every edit and shifts the bottom tier along with it.
 *
 * A document with only top, 1-wide lanes behaves exactly as before: lane i
 * is column i.
 */

type Arch = LoomDocument["architecture"];

export interface LaneBox {
  id: string;
  label: string;
  /** Index in `columns` (virtual lanes: after the real ones). */
  index: number;
  tier: 0 | 1;
  startCol: number;
  width: 1 | 2;
  /** No header: nodes placed past the last declared lane of a tier. */
  virtual?: boolean;
}

export const widthOf = (c: ArchColumn): 1 | 2 => (c.width === 2 ? 2 : 1);
export const tierOf = (c: ArchColumn): 0 | 1 => (c.tier === "bottom" ? 1 : 0);
export const hasBottomTier = (columns: ArchColumn[]) => columns.some((c) => tierOf(c) === 1);
/** Any 2-wide or bottom lane: cells no longer equal lane indexes. */
export const usesLanes2d = (columns: ArchColumn[]) => columns.some((c) => tierOf(c) === 1 || widthOf(c) === 2);

/** Lane rectangles' columns, per tier, left-aligned in `columns` order. */
export function laneBoxes(columns: ArchColumn[]): LaneBox[] {
  const next = [0, 0];
  return columns.map((c, index) => {
    const tier = tierOf(c);
    const width = widthOf(c);
    const box: LaneBox = { id: c.id, label: c.label, index, tier, startCol: next[tier], width };
    next[tier] += width;
    return box;
  });
}

/** Column count used by a tier's declared lanes. */
function tierWidth(boxes: LaneBox[], tier: 0 | 1) {
  return boxes.filter((b) => b.tier === tier).reduce((s, b) => Math.max(s, b.startCol + b.width), 0);
}

/** First row of the bottom tier (undefined: single tier). */
export function splitRow(arch: Arch): number | undefined {
  if (!hasBottomTier(arch.columns)) return undefined;
  if (Number.isInteger(arch.split) && (arch.split as number) >= 1) return arch.split;
  // Not stored yet: below every node.
  return Math.max(1, ...arch.nodes.map((n) => (n.row ?? 0) + 1));
}

export interface Member {
  /** Lane id, or `__pad_<tier>_<col>` for a header-less column. */
  lane: string;
  tier: 0 | 1;
  /** Column inside the lane (0 or 1). */
  dx: number;
  /** Row inside the tier. */
  dy: number;
}

/** Which lane each node is in, from its cell (and the stored split). */
export function memberships(arch: Arch): Map<string, Member> {
  const boxes = laneBoxes(arch.columns);
  const split = splitRow(arch);
  const out = new Map<string, Member>();
  // Lanes set wide / to the bottom tier by hand (or by an LLM) on a
  // document never packed by the app: no `split` yet, cells still mean
  // "column = lane, row = row in it" — read them that way.
  if (usesLanes2d(arch.columns) && !Number.isInteger(arch.split)) {
    arch.nodes.forEach((n) => {
      const col = n.col ?? 0;
      const c = arch.columns[col];
      out.set(n.id, c ? { lane: c.id, tier: tierOf(c), dx: 0, dy: n.row ?? 0 } : { lane: `__pad_0_${col - arch.columns.length}`, tier: 0, dx: 0, dy: n.row ?? 0 });
    });
    return out;
  }
  arch.nodes.forEach((n) => {
    const row = n.row ?? 0;
    const col = n.col ?? 0;
    const tier: 0 | 1 = split !== undefined && row >= split ? 1 : 0;
    const dy = tier === 1 ? row - (split as number) : row;
    const box = boxes.find((b) => b.tier === tier && col >= b.startCol && col < b.startCol + b.width);
    if (box) out.set(n.id, { lane: box.id, tier, dx: col - box.startCol, dy });
    else out.set(n.id, { lane: `__pad_${tier}_${col - tierWidth(boxes, tier)}`, tier, dx: 0, dy });
  });
  return out;
}

/** Lane boxes plus the header-less columns some node sits in. */
function boxesWithPads(columns: ArchColumn[], members: Map<string, Member>): LaneBox[] {
  const boxes = laneBoxes(columns);
  const pads = new Map<string, LaneBox>();
  members.forEach((m) => {
    if (!m.lane.startsWith("__pad_") || pads.has(m.lane)) return;
    const [t, k] = m.lane.slice("__pad_".length).split("_");
    const tier = Number(t) as 0 | 1;
    pads.set(m.lane, {
      id: m.lane,
      label: "",
      index: columns.length + pads.size,
      tier,
      startCol: tierWidth(boxes, tier) + Number(k),
      width: 1,
      virtual: true,
    });
  });
  return [...boxes, ...pads.values()];
}

/**
 * Cells from lane memberships under `columns`: each lane at its packed
 * position, a narrowed lane folding column 1 into column 0, clashes pushed
 * down within the lane, the bottom tier right under the top one.
 * Nodes without a membership keep their cell.
 */
export function placeMembers(arch: Arch, columns: ArchColumn[], members: Map<string, Member>): Arch {
  const all = boxesWithPads(columns, members);
  const byId = new Map(all.map((b) => [b.id, b]));
  const taken = new Set<string>();
  const local = new Map<string, { box: LaneBox; dx: number; dy: number }>();
  arch.nodes.forEach((n) => {
    const m = members.get(n.id);
    const box = m ? byId.get(m.lane) : undefined;
    if (!m || !box) return;
    const dx = Math.min(m.dx, box.width - 1);
    let dy = m.dy;
    while (taken.has(`${box.id}|${dx}|${dy}`)) dy++;
    taken.add(`${box.id}|${dx}|${dy}`);
    local.set(n.id, { box, dx, dy });
  });
  const bottom = hasBottomTier(columns) || [...local.values()].some((l) => l.box.tier === 1);
  const topHeight = Math.max(1, ...[...local.values()].filter((l) => l.box.tier === 0).map((l) => l.dy + 1));
  // Stored whenever cells stop being lane indexes (also with only 2-wide
  // lanes), marking the document as packed — see memberships().
  const split = bottom || usesLanes2d(columns) ? topHeight : undefined;
  const nodes: ArchNode[] = arch.nodes.map((n) => {
    const l = local.get(n.id);
    if (!l) return n;
    const col = l.box.startCol + l.dx;
    const row = l.box.tier === 1 ? (split as number) + l.dy : l.dy;
    return col === n.col && row === n.row ? n : { ...n, col, row };
  });
  const { split: _old, ...rest } = arch;
  return { ...rest, columns, nodes, ...(split !== undefined ? { split } : {}) };
}

/** Re-pack after any edit: tiers to their auto heights, lanes in place. */
export function settleLanes(arch: Arch): Arch {
  return placeMembers(arch, arch.columns, memberships(arch));
}

/** Rows each tier spans (bottom undefined for a single tier). */
export function tierRows(arch: Arch): { top: { start: number; height: number }; bottom?: { start: number; height: number } } {
  const split = splitRow(arch);
  const rows = (pred: (r: number) => boolean) => arch.nodes.map((n) => n.row ?? 0).filter(pred);
  if (split === undefined) return { top: { start: 0, height: Math.max(1, ...rows(() => true).map((r) => r + 1)) } };
  const topH = Math.max(1, ...rows((r) => r < split).map((r) => r + 1));
  const botH = Math.max(1, ...rows((r) => r >= split).map((r) => r - split + 1));
  return { top: { start: 0, height: topH }, bottom: { start: split, height: botH } };
}

/** All lanes to draw (header-less ones included, flagged virtual). */
export function drawnLanes(arch: Arch): LaneBox[] {
  return boxesWithPads(arch.columns, memberships(arch));
}

/** Lane index (in `columns`; header-less columns after them) per node —
 * what used to be just `node.col`. */
export function laneIndexByNode(arch: Arch): Map<string, number> {
  const members = memberships(arch);
  const byId = new Map(boxesWithPads(arch.columns, members).map((b) => [b.id, b.index]));
  const out = new Map<string, number>();
  members.forEach((m, id) => out.set(id, byId.get(m.lane) ?? 0));
  return out;
}
