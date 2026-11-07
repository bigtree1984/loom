import type { Node } from "@xyflow/react";
import type { Artifact } from "../types";
import type { ArtifactMotion, ArtifactPlaces } from "./artifactState";
import type { CellGeometry } from "./gridGeometry";
import type { LoomArtifactChipData } from "../components/LoomArtifactChip";

export const CHIP_W = 118;
export const CHIP_H = 20;
const CHIP_GAP = 3;

/** Where the i-th chip on a node sits: a column hanging off the node's
 * lower-right corner, so chips never cover the node's own label. */
export function chipSlot(nodePos: { x: number; y: number }, g: CellGeometry, i: number) {
  return { x: nodePos.x + g.nodeW - CHIP_W * 0.55, y: nodePos.y + g.nodeH - CHIP_H * 0.5 + i * (CHIP_H + CHIP_GAP) };
}

/**
 * React Flow nodes for the artifacts (DESIGN_v3 §3.4): every artifact born
 * so far, on the node it is on now; the current step's ones in `color`.
 * Ids are stable per artifact so a move animates instead of re-mounting.
 */
export function toArtifactNodes(
  artifacts: Artifact[],
  places: ArtifactPlaces,
  motions: Map<string, ArtifactMotion>,
  nodePos: Map<string, { x: number; y: number }>,
  g: CellGeometry,
  color: string,
  stepKey: string,
): Node[] {
  const slotIndex = new Map<string, number>();
  const nextSlot = (node: string) => {
    const i = slotIndex.get(node) ?? 0;
    slotIndex.set(node, i + 1);
    return i;
  };
  const touched = new Set([...motions.values()].filter((m) => !m.ghost).map((m) => m.id));
  const out: Node[] = [];
  const slotOf = new Map<string, { x: number; y: number }>();

  artifacts.forEach((a) => {
    const p = places.get(a.id);
    if (!p?.node) return; // never born
    const pos = nodePos.get(p.node);
    if (!pos) return;
    const m = motions.get(a.id);
    const slot = p.visible ? chipSlot(pos, g, nextSlot(p.node)) : chipSlot(pos, g, 0);
    slotOf.set(a.id, slot);
    const data: LoomArtifactChipData = {
      label: a.label,
      active: touched.has(a.id),
      color,
      born: !!m?.born,
      hidden: !p.visible,
      stepKey,
    };
    out.push(chipNode(`artifact-${a.id}`, slot, data, p.visible ? 5 : 4));
  });

  // Flying copies (keep:true sends) and transient signals: start at the
  // sender, land on the receiver, then fade out.
  let gi = 0;
  motions.forEach((m, key) => {
    if (!m.ghost || !m.toNode) return;
    const to = nodePos.get(m.toNode);
    const from = m.fromNode ? nodePos.get(m.fromNode) : undefined;
    if (!to) return;
    const end = chipSlot(to, g, 0);
    const start = from ? chipSlot(from, g, 0) : end;
    const a = artifacts.find((x) => x.id === m.id);
    const data: LoomArtifactChipData = {
      label: a?.label ?? m.id,
      active: true,
      color,
      ghost: { dx: start.x - end.x, dy: start.y - end.y },
      stepKey: `${stepKey}-${gi++}`,
    };
    out.push(chipNode(`artifact-ghost-${key}-${stepKey}`, end, data, 6));
  });
  return out;
}

function chipNode(id: string, position: { x: number; y: number }, data: LoomArtifactChipData, zIndex: number): Node {
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
    style: { width: CHIP_W, height: CHIP_H, pointerEvents: "none", padding: 0, border: "none", background: "transparent" },
  };
}
