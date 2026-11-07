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
export function toArtifactNodes(
  artifacts: Artifact[],
  places: ArtifactPlaces,
  motions: Map<string, ArtifactMotion>,
  nodePos: Map<string, { x: number; y: number }>,
  g: CellGeometry,
  color: string,
  stepKey: string,
  edges: { from: string; to: string }[] = [],
): Node[] {
  const slotIndex = new Map<string, number>();
  const toolIndex = new Map<string, number>();
  const nextSlot = (node: string, tool = false) => {
    const m = tool ? toolIndex : slotIndex;
    const i = m.get(node) ?? 0;
    m.set(node, i + 1);
    return i;
  };
  const touched = new Set([...motions.values()].filter((m) => !m.ghost).map((m) => m.id));
  const out: Node[] = [];
  // Waypoints as offsets from the chip's final slot (intermediate nodes use
  // their first slot).
  const pointsFor = (path: string[], end: { x: number; y: number }) =>
    routed(path, edges)
      .map((n) => nodePos.get(n))
      .filter((p): p is { x: number; y: number } => !!p)
      .map((p, i, all) => {
        const s = i === all.length - 1 ? end : chipSlot(p, g, 0);
        return { dx: s.x - end.x, dy: s.y - end.y };
      });

  artifacts.forEach((a) => {
    const p = places.get(a.id);
    if (!p?.node) return; // never born
    const pos = nodePos.get(p.node);
    if (!pos) return;
    const m = motions.get(a.id);
    const isTool = !!a.tool;
    const slot = isTool
      ? toolSlot(pos, g, p.visible ? nextSlot(p.node, true) : 0)
      : p.visible
        ? chipSlot(pos, g, nextSlot(p.node))
        : chipSlot(pos, g, 0);
    let anim: ChipAnim | undefined;
    // Born and then handed on in the same step: appear at the birthplace,
    // then travel.
    if (m?.path && m.path.length > 1 && p.visible) anim = { kind: "move", points: pointsFor(m.path, slot), fadeIn: !!m.born };
    else if (m?.born) anim = { kind: "born" };
    else if (m?.ended) anim = { kind: "ended" };
    const data: LoomArtifactChipData = {
      label: a.label,
      active: touched.has(a.id),
      color,
      // A chip used up in this step stays visible to play its fade.
      hidden: !p.visible && !m?.ended,
      anim,
      tool: isTool,
      stepKey,
    };
    out.push(chipNode(`artifact-${a.id}`, slot, data, p.visible ? 5 : 4, isTool));
  });

  // Flying copies (keep) and transient signals: sender -> receiver along
  // the edges, gone on arrival.
  let gi = 0;
  motions.forEach((m, key) => {
    if (!m.ghost || !m.toNode || !m.path) return;
    const to = nodePos.get(m.toNode);
    if (!to) return;
    const end = chipSlot(to, g, 0);
    const a = artifacts.find((x) => x.id === m.id);
    const data: LoomArtifactChipData = {
      label: a?.label ?? m.id,
      active: true,
      color,
      anim: { kind: "move", points: pointsFor(m.path, end), fadeOut: true },
      stepKey: `${stepKey}-${gi++}`,
    };
    out.push(chipNode(`artifact-ghost-${key}-${stepKey}`, end, data, 6));
  });
  return out;
}

function chipNode(id: string, position: { x: number; y: number }, data: LoomArtifactChipData, zIndex: number, tool = false): Node {
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
    style: { width: tool ? TOOL_W : CHIP_W, height: tool ? TOOL_H : CHIP_H, pointerEvents: "none", padding: 0, border: "none", background: "transparent" },
  };
}
