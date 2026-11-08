import type { Node } from "@xyflow/react";
import type { Artifact } from "../types";
import type { ArtifactMotion, ArtifactPlaces } from "./artifactState";
import type { CellGeometry } from "./gridGeometry";
import type { ChipAnim, LoomArtifactChipData } from "../components/LoomArtifactChip";

export const CHIP_W = 118;
export const CHIP_H = 20;
const CHIP_GAP = 3;
export const TOOL_W = 104;
export const TOOL_H = 18;

/** Where the i-th chip on a node sits: a column hanging off the node's
 * lower-right corner, so chips never cover the node's own label. */
export function chipSlot(nodePos: { x: number; y: number }, g: CellGeometry, i: number) {
  return { x: nodePos.x + g.nodeW - CHIP_W * 0.55, y: nodePos.y + g.nodeH - CHIP_H * 0.5 + i * (CHIP_H + CHIP_GAP) };
}

/** Where the i-th tool sits: attached across the node's bottom edge,
 * centred, so it reads as part of the node rather than lying beside it. */
export function toolSlot(nodePos: { x: number; y: number }, g: CellGeometry, i: number) {
  // A hexagon narrows to a point at the bottom, so the band sits inside
  // its lower half instead of on the (pointed) edge.
  const base = g.oddRowShift > 0 ? g.nodeH * 0.7 : g.nodeH - TOOL_H * 0.6;
  return { x: nodePos.x + (g.nodeW - TOOL_W) / 2, y: nodePos.y + base - i * (TOOL_H + 2) };
}

/** Shortest node path a -> b over the architecture edges (direction
 * ignored), so a move is drawn along the lines rather than straight
 * across. Falls back to a direct hop when they aren't connected. */
export function routeAlongEdges(a: string, b: string, edges: { from: string; to: string }[]): string[] {
  if (a === b) return [a];
  const adj = new Map<string, string[]>();
  edges.forEach((e) => {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), e.from]);
  });
  const prev = new Map<string, string>([[a, a]]);
  const queue = [a];
  while (queue.length) {
    const n = queue.shift()!;
    if (n === b) break;
    (adj.get(n) ?? []).forEach((m) => {
      if (!prev.has(m)) {
        prev.set(m, n);
        queue.push(m);
      }
    });
  }
  if (!prev.has(b)) return [a, b];
  const path = [b];
  while (path[0] !== a) path.unshift(prev.get(path[0])!);
  return path;
}

/** Expand a motion's node path hop by hop along the edges. */
function routed(path: string[], edges: { from: string; to: string }[]): string[] {
  const out: string[] = [];
  path.forEach((n, i) => {
    if (i === 0) return void out.push(n);
    out.push(...routeAlongEdges(path[i - 1], n, edges).slice(1));
  });
  return out;
}

/**
 * React Flow nodes for the artifacts (DESIGN_v3 §3.4): every artifact born
 * so far, on the node it is on now; the current step's ones in `color`,
 * replaying (looping) what the step did to them.
 * Ids are stable per artifact so React Flow keeps the same element.
 */
/** One action gets ACTION_MS, then a short pause so the next starts once
 * it has visibly finished; the loop rests HOLD_MS at the end. */
export const ACTION_MS = 1300;
export const GAP_MS = 400;
export const HOLD_MS = 1000;
/** A copy / signal that is gone on arrival rests this long at its
 * destination first, so its label can be read. */
export const ARRIVE_HOLD_MS = 1000;
/** Loop clock. `holds` = action indexes containing such a vanishing
 * arrival; those actions get ARRIVE_HOLD_MS extra. */
export function stepLoopTiming(actions: number, holds: ReadonlySet<number> = new Set(), actionMs: readonly number[] = []) {
  const starts: number[] = [];
  let t = 0;
  const ms = (i: number) => actionMs[i] ?? ACTION_MS;
  for (let i = 0; i < actions; i++) {
    starts.push(t);
    t += ms(i) + (holds.has(i) ? ARRIVE_HOLD_MS : 0) + GAP_MS;
  }
  const start = (i: number) => starts[i] ?? t;
  const slotAt = (ms: number) => {
    let cur = 0;
    starts.forEach((s, i) => {
      if (ms >= s) cur = i;
    });
    return cur;
  };
  return { duration: t + HOLD_MS, start, slotAt, ms, hold: (i: number) => (holds.has(i) ? ARRIVE_HOLD_MS : 0) };
}

/** Constant speed (flow px per second) for moves; each action's length
 * follows its longest move, within [MIN, MAX] travel time. The move takes
 * TRAVEL_FRAC of its action (the rest: appearing / settling). */
export const MOVE_PX_PER_S = 220;
export const MIN_TRAVEL_MS = 700;
export const MAX_TRAVEL_MS = 2600;
export const TRAVEL_FRAC = 0.72;

/** Screen length of a route through these nodes (first chip slots). */
function routeLength(path: string[], nodePos: Map<string, { x: number; y: number }>, edges: { from: string; to: string }[]) {
  const pts = routed(path, edges)
    .map((n) => nodePos.get(n))
    .filter((p): p is { x: number; y: number } => !!p);
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return d;
}

/** Length (ms) of each action of the step, from its longest move. Shared
 * by the chips and the action captions so both run on one clock. */
export function actionDurations(
  motions: Map<string, ArtifactMotion>,
  nodePos: Map<string, { x: number; y: number }>,
  edges: { from: string; to: string }[],
  actionCount: number,
): number[] {
  const longest: number[] = [];
  motions.forEach((m) => {
    if (!m.path || m.path.length < 2) return;
    const i = m.end ?? 0;
    longest[i] = Math.max(longest[i] ?? 0, routeLength(m.path, nodePos, edges));
  });
  return Array.from({ length: Math.max(actionCount, longest.length) }, (_, i) => {
    if (!longest[i]) return ACTION_MS;
    const travel = Math.min(MAX_TRAVEL_MS, Math.max(MIN_TRAVEL_MS, (longest[i] / MOVE_PX_PER_S) * 1000));
    return Math.round(travel / TRAVEL_FRAC);
  });
}

/** Compact mode (crowded nodes): tools become small icons in a row, and
 * a node shows at most this many chips (+N for the rest). */
export const MAX_CHIPS = 2;
export const TOOL_ICON = 18;

export function toolIconSlot(nodePos: { x: number; y: number }, g: CellGeometry, i: number, n: number) {
  const gap = 3;
  const rowW = n * TOOL_ICON + (n - 1) * gap;
  const base = g.oddRowShift > 0 ? g.nodeH * 0.7 : g.nodeH - TOOL_ICON * 0.6;
  return { x: nodePos.x + (g.nodeW - rowW) / 2 + i * (TOOL_ICON + gap), y: nodePos.y + base };
}

interface SlotLayout {
  /** Where each shown artifact sits. */
  pos: Map<string, { x: number; y: number }>;
  /** Shown as a small tool icon (compact). */
  icon: Set<string>;
  /** Collapsed into a node's "+N" chip (compact). */
  collapsed: Set<string>;
  /** Per node: the "+N" chip. */
  more: Map<string, { count: number; labels: string[]; pos: { x: number; y: number } }>;
  /** Compact: chips merged into the chip of another artifact that the same
   * action moved / used together (member -> leader), and each leader's
   * number of extra members ("画像 ほか2件"). */
  groupedInto: Map<string, string>;
  groupExtra: Map<string, number>;
}

/** Artifacts the current step handled in the same action, the same way,
 * from the same place share a key (undefined = not handled this step). */
export function motionGroupKey(m: ArtifactMotion | undefined): string | undefined {
  if (!m || m.ghost) return undefined;
  if (m.start !== undefined) return `m${m.start}|${m.fromNode ?? ""}|${m.born ? "b" : ""}${m.ended ? "e" : ""}`;
  if (m.touchedAt !== undefined) return `t${m.touchedAt}`;
  return undefined;
}

/** Lay out the visible artifacts of `places` on their nodes. In compact
 * mode the step's touched artifacts are always shown individually. */
function layoutSlots(
  artifacts: Artifact[],
  places: ArtifactPlaces,
  nodePos: Map<string, { x: number; y: number }>,
  g: CellGeometry,
  compact: boolean,
  mustShow: Set<string>,
  motions?: Map<string, ArtifactMotion>,
): SlotLayout {
  const out: SlotLayout = {
    pos: new Map(),
    icon: new Set(),
    collapsed: new Set(),
    more: new Map(),
    groupedInto: new Map(),
    groupExtra: new Map(),
  };
  const byNode = new Map<string, { tools: Artifact[]; chips: Artifact[] }>();
  artifacts.forEach((a) => {
    const p = places.get(a.id);
    if (!p?.visible || !p.node || !nodePos.has(p.node)) return;
    const e = byNode.get(p.node) ?? { tools: [], chips: [] };
    (a.tool ? e.tools : e.chips).push(a);
    byNode.set(p.node, e);
  });
  byNode.forEach(({ tools, chips: listed }, node) => {
    // A derived artifact sits right below the one it was derived from.
    const allChips = listed.filter((a) => !listed.some((b) => b.id === places.get(a.id)?.after));
    listed
      .filter((a) => !allChips.includes(a))
      .forEach((a) => {
        const i = allChips.findIndex((b) => b.id === places.get(a.id)?.after);
        if (i >= 0) allChips.splice(i + 1, 0, a);
        else allChips.push(a);
      });
    let chips = allChips;
    const pos = nodePos.get(node)!;
    tools.forEach((a, i) => {
      if (compact) {
        out.icon.add(a.id);
        out.pos.set(a.id, toolIconSlot(pos, g, i, tools.length));
      } else out.pos.set(a.id, toolSlot(pos, g, i));
    });
    // Chips hang below any tools attached to the same node.
    const off = tools.length ? 0.7 : 0;
    // Compact: one chip per group of artifacts the step handled together.
    if (compact && motions) {
      const leaders = new Map<string, string>();
      chips = chips.filter((a) => {
        const key = motionGroupKey(motions.get(a.id));
        if (!key) return true;
        const leader = leaders.get(key);
        if (!leader) {
          leaders.set(key, a.id);
          return true;
        }
        out.groupedInto.set(a.id, leader);
        out.groupExtra.set(leader, (out.groupExtra.get(leader) ?? 0) + 1);
        return false;
      });
    }
    let shown = chips;
    if (compact && chips.length > MAX_CHIPS) {
      const must = chips.filter((a) => mustShow.has(a.id));
      const rest = chips.filter((a) => !mustShow.has(a.id));
      const room = Math.max(0, MAX_CHIPS - must.length);
      shown = [...chips.filter((a) => must.includes(a) || rest.slice(0, room).includes(a))];
      const hidden = chips.filter((a) => !shown.includes(a));
      hidden.forEach((a) => out.collapsed.add(a.id));
      if (hidden.length) out.more.set(node, { count: hidden.length, labels: hidden.map((a) => a.label), pos: chipSlot(pos, g, shown.length + off) });
    }
    shown.forEach((a, i) => out.pos.set(a.id, chipSlot(pos, g, i + off)));
  });
  return out;
}

/**
 * React Flow nodes for the artifacts (DESIGN_v3 §3.4): every artifact born
 * so far, on the node it is on now; the current step's ones in `color`,
 * replaying (looping) what the step did to them, one action after another.
 * Ids are stable per artifact so React Flow keeps the same element.
 */
export function toArtifactNodes(
  artifacts: Artifact[],
  places: ArtifactPlaces,
  motions: Map<string, ArtifactMotion>,
  nodePos: Map<string, { x: number; y: number }>,
  g: CellGeometry,
  color: string,
  stepKey: string,
  edges: { from: string; to: string }[] = [],
  before?: ArtifactPlaces,
  compact = false,
  actionCount = 0,
  actionMs: readonly number[] = [],
): Node[] {
  const touched = new Set([...motions.values()].filter((m) => !m.ghost).map((m) => m.id));
  const now = layoutSlots(artifacts, places, nodePos, g, compact, touched, motions);
  // Where each artifact sat before this step, so a move starts from its
  // actual old spot (chip, tool band or icon) rather than a default slot.
  const prev = before ? layoutSlots(artifacts, before, nodePos, g, compact, touched, motions) : undefined;
  // Next free chip slot on a node before this step (where an arrival lands).
  const freeSlot = (node: string) => {
    const pos = nodePos.get(node)!;
    if (!prev) return chipSlot(pos, g, 0);
    let n = 0;
    prev.pos.forEach((_, id) => {
      const a = artifacts.find((x) => x.id === id);
      if (a && !a.tool && before?.get(id)?.node === node) n++;
    });
    if (prev.more.has(node)) n++;
    const hasTools = artifacts.some((x) => x.tool && before?.get(x.id)?.visible && before?.get(x.id)?.node === node);
    return chipSlot(pos, g, n + (hasTools ? 0.7 : 0));
  };

  // The step's actions play one after another in a shared loop (see
  // stepLoopTiming; the action captions use the same clock).
  const holds = new Set([...motions.values()].filter((m) => m.ghost).map((m) => m.start ?? 0));
  const clock = stepLoopTiming(Math.max(actionCount, 1, ...[...motions.values()].map((m) => (m.end ?? 0) + 1)), holds, actionMs);
  const duration = clock.duration;
  const win = (m: ArtifactMotion) => ({
    from: clock.start(m.start ?? 0) / duration,
    to: (clock.start(m.end ?? 0) + clock.ms(m.end ?? 0)) / duration,
    duration,
  });
  // Vanishing arrivals: travel in ACTION_MS, then rest before fading.
  const ghostWin = (m: ArtifactMotion) => {
    const w = win(m);
    return { ...w, to: w.to + clock.hold(m.end ?? 0) / duration, fadeFrom: w.to };
  };

  // Where something born and moved on in the same step first appears:
  // right below what it was derived from, if that is on the birth node.
  const bornSpot = (m: ArtifactMotion) => {
    const src = m.bornAfter ? (now.pos.get(m.bornAfter) ?? prev?.pos.get(m.bornAfter)) : undefined;
    return src ? { x: src.x, y: src.y + CHIP_H + CHIP_GAP } : undefined;
  };
  // Waypoints as offsets from the final spot (intermediate nodes use their
  // first chip slot).
  const pointsFor = (path: string[], end: { x: number; y: number }, start?: { x: number; y: number }) =>
    routed(path, edges)
      .map((n) => nodePos.get(n))
      .filter((p): p is { x: number; y: number } => !!p)
      .map((p, i, all) => {
        const s = i === all.length - 1 ? end : i === 0 && start ? start : chipSlot(p, g, 0);
        return { dx: s.x - end.x, dy: s.y - end.y };
      });

  const out: Node[] = [];
  artifacts.forEach((a) => {
    const p = places.get(a.id);
    if (!p?.node) return; // never born
    const pos = nodePos.get(p.node);
    if (!pos) return;
    if (now.collapsed.has(a.id) || now.groupedInto.has(a.id)) return; // inside a +N / group chip
    const m = motions.get(a.id);
    const icon = now.icon.has(a.id);
    const slot = now.pos.get(a.id) ?? (a.tool ? toolSlot(pos, g, 0) : chipSlot(pos, g, 0));
    let anim: ChipAnim | undefined;
    // Born and then handed on in the same step: appear at the birthplace,
    // then travel.
    if (m?.path && m.path.length > 1 && p.visible)
      anim = { kind: "move", points: pointsFor(m.path, slot, m.born ? bornSpot(m) : prev?.pos.get(a.id)), fadeIn: !!m.born, ...win(m) };
    // Born, then sent off as a signal in the same step: appears, then is
    // gone the moment its copy sets off.
    else if (m?.born && m.ended)
      anim = { kind: "born", ...win(m), until: clock.start(m.end ?? 0) / duration };
    else if (m?.born) anim = { kind: "born", ...win(m) };
    else if (m?.ended) anim = { kind: "ended", ...win(m) };
    const extra = now.groupExtra.get(a.id);
    const data: LoomArtifactChipData = {
      label: extra ? `${a.label} ほか${extra}件` : a.label,
      active: touched.has(a.id),
      color,
      // A chip used up in this step stays visible to play its fade.
      hidden: !p.visible && !m?.ended,
      anim,
      tool: !!a.tool && !icon,
      toolIcon: icon,
      stepKey,
    };
    const size = icon ? { w: TOOL_ICON, h: TOOL_ICON } : a.tool ? { w: TOOL_W, h: TOOL_H } : { w: CHIP_W, h: CHIP_H };
    out.push(chipNode(`artifact-${a.id}`, slot, data, p.visible ? 5 : 4, size));
  });

  // When an arrival is what crowds a node: what was shown there stays until
  // the arrival lands, then slides into the "+N" chip, which appears then.
  const arrivalAt = (node: string) => {
    let t: number | undefined;
    motions.forEach((m) => {
      if (m.ghost || m.toNode !== node || !m.path || m.path.length < 2) return;
      const at = (clock.start(m.end ?? 0) + clock.ms(m.end ?? 0) * 0.3) / duration;
      t = t === undefined ? at : Math.max(t, at);
    });
    return t;
  };
  const crowdedAt = new Map<string, number>();
  artifacts.forEach((a) => {
    if (!now.collapsed.has(a.id) || !prev || prev.collapsed.has(a.id) || prev.groupedInto.has(a.id)) return;
    const p = places.get(a.id);
    const from = prev.pos.get(a.id);
    const more = p?.node ? now.more.get(p.node) : undefined;
    if (!p?.node || !from || !more || before?.get(a.id)?.node !== p.node || prev.icon.has(a.id)) return;
    const t = arrivalAt(p.node);
    if (t === undefined) return;
    crowdedAt.set(p.node, t);
    const data: LoomArtifactChipData = {
      label: a.label,
      color,
      anim: { kind: "collapse", dx: from.x - more.pos.x, dy: from.y - more.pos.y, from: t, to: Math.min(1, t + 400 / duration), duration },
      stepKey,
    };
    out.push(chipNode(`artifact-${a.id}`, more.pos, data, 4, { w: CHIP_W, h: CHIP_H }));
  });

  // "+N" chips for crowded nodes (compact).
  now.more.forEach(({ count, labels, pos }, node) => {
    const t = crowdedAt.get(node);
    const data: LoomArtifactChipData = {
      label: `+${count}`,
      stepKey,
      more: true,
      items: labels,
      ...(t !== undefined ? { anim: { kind: "born" as const, from: t, to: Math.min(1, t + 400 / duration), duration } } : {}),
    };
    out.push(chipNode(`artifact-more-${node}`, pos, data, 7, { w: 40, h: CHIP_H }));
  });

  // Flying copies (keep) and transient signals: sender -> receiver along
  // the edges, landing where any arrival would (the next free chip slot),
  // gone on arrival.
  let gi = 0;
  // Compact: copies that fly together (same action, same route) fly as one.
  const ghostGroups = new Map<string, number>();
  const ghostSeen = new Set<string>();
  if (compact)
    motions.forEach((m) => {
      if (!m.ghost) return;
      const k = `${m.start}|${m.fromNode}|${m.toNode}`;
      ghostGroups.set(k, (ghostGroups.get(k) ?? 0) + 1);
    });
  motions.forEach((m, key) => {
    if (!m.ghost || !m.toNode || !m.path) return;
    const gk = `${m.start}|${m.fromNode}|${m.toNode}`;
    if (compact) {
      if (ghostSeen.has(gk)) return;
      ghostSeen.add(gk);
    }
    const ghostExtra = compact ? (ghostGroups.get(gk) ?? 1) - 1 : 0;
    if (!nodePos.get(m.toNode)) return;
    const end = freeSlot(m.toNode);
    const a = artifacts.find((x) => x.id === m.id);
    const data: LoomArtifactChipData = {
      label: ghostExtra ? `${a?.label ?? m.id} ほか${ghostExtra}件` : (a?.label ?? m.id),
      active: true,
      color,
      anim: { kind: "move", points: pointsFor(m.path, end, prev?.pos.get(m.id)), fadeOut: true, ...ghostWin(m) },
      stepKey: `${stepKey}-${gi++}`,
    };
    out.push(chipNode(`artifact-ghost-${key}-${stepKey}`, end, data, 6, { w: CHIP_W, h: CHIP_H }));
  });
  return out;
}

function chipNode(
  id: string,
  position: { x: number; y: number },
  data: LoomArtifactChipData,
  zIndex: number,
  size: { w: number; h: number },
): Node {
  return {
    id,
    type: "loomArtifact",
    position,
    data,
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    zIndex,
    className: "loom-artifact-node",
    style: { width: size.w, height: size.h, pointerEvents: data.items ? "auto" : "none", padding: 0, border: "none", background: "transparent" },
  };
}
