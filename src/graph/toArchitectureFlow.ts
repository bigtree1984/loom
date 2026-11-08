import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { LoomDocument } from "../types";
import { cellToPixel, columnX, geometryFor, HEADER_Y, laneTileRect, type CellGeometry } from "./gridGeometry";
import { drawnLanes, tierRows } from "./lanes";
import { routeColorFor } from "./routeColors";
import { iconUrlFor } from "./iconRegistry";
import { truncateLabel } from "./textUtils";
import type { ArchNodeHighlight } from "../state/useLoomState";
import { activeEdgeFlow } from "./taskFlow";
import { edgeDirectionOf } from "./gridEdits";
import type { LoomEdgeData } from "../components/LoomArchEdge";
import type { LoomArchNodeData } from "../components/LoomArchNode";

const MAX_LABEL_CHARS_PER_LINE = 12;


const NEUTRAL_BORDER = "var(--loom-border)";
const NEUTRAL_EDGE = "var(--loom-neutral-border)";

export interface LaneTile {
  /** "band" = the strip behind the column header, joining it to the tiles. */
  kind?: "band";
  /** Lane (index in columns / header-less after them): tint parity, ids. */
  lane: number;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaneHeader {
  /** Lane index in `columns`. */
  col: number;
  id: string;
  label: string;
  x: number;
  /** Header top (the bottom tier's headers sit below it). */
  y: number;
  /** Top of the tier's first row (lane drag: which tier a drop is in). */
  tierTop: number;
  /** Header width (a 2-wide lane's spans both columns). */
  w: number;
  tier: 0 | 1;
  /** Position among its tier's lanes. */
  tierIndex: number;
  tierCount: number;
  width: 1 | 2;
}


export function toArchitectureFlow(
  architecture: LoomDocument["architecture"],
  highlightedArchNodes: Map<string, ArchNodeHighlight>,
  editable = false,
): { nodes: Node[]; edges: Edge[]; laneHeaders: LaneHeader[]; tiles: LaneTile[]; geometry: CellGeometry } {
  const layout = architecture.layout ?? "grid";
  const geometry = geometryFor(layout);

  // Nothing current (cleared step): show every node at full strength
  // rather than all of them dimmed.
  const anyActive = highlightedArchNodes.size > 0;
  const nodes: Node[] = architecture.nodes.map((n) => {
    const position = cellToPixel(n.col ?? 0, n.row ?? 0, layout);
    const highlight = highlightedArchNodes.get(n.id);
    const isMain = highlight?.role === "main";
    const borderColor = highlight ? routeColorFor(highlight.routeIndex)[isMain ? "strong" : "light"].border : NEUTRAL_BORDER;
    const isHex = layout === "hex";
    const borderWidth = isMain ? 2 : 1;
    // The subject of the current task: filled with its route colour.
    const mainColor = isMain && highlight ? routeColorFor(highlight.routeIndex).strong : undefined;
    // Hex: hand the full label to CSS (2-line clamp with ellipsis) so the
    // wrap point and the "…" always agree — counting characters in JS
    // couldn't know where the browser would actually wrap.
    const label = isHex ? n.label : truncateLabel(n.label, MAX_LABEL_CHARS_PER_LINE);
    const data: LoomArchNodeData = {
      label,
      shape: isHex ? "hex" : "rect",
      borderColor,
      borderWidth,
      fill: mainColor?.bg,
      fullLabel: n.label,
      isHuman: n.type === "human",
      iconUrl: iconUrlFor(n.icon),
      connectable: editable,
    };
    return {
      id: n.id,
      type: "loomArchNode",
      position,
      data,
      style: {
        width: geometry.nodeW,
        height: geometry.nodeH,
        // Hex nodes draw their own outline + fill as an SVG polygon inside
        // LoomArchNode (a CSS border would stay rectangular under clip-path).
        background: isHex ? "transparent" : (mainColor?.bg ?? "var(--loom-panel-bg)"),
        border: isHex ? "none" : `${borderWidth}px solid ${borderColor}`,
        borderRadius: isHex ? 0 : 8,
        color: mainColor?.text ?? "var(--loom-text-primary)",
        fontWeight: isMain ? 600 : 500,
        fontSize: 13,
        opacity: highlight || !anyActive ? 1 : 0.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: isHex ? "8px 22px" : 8,
      },
    };
  });

  const edges: Edge[] = architecture.edges.map((e, i) => {
    // Live edge (between a current task's main node and one of its io
    // nodes): arrows and the moving dot follow the task's input/output
    // settings, not the edge's own architecture arrow.
    const live = activeEdgeFlow(highlightedArchNodes.get(e.from), highlightedArchNodes.get(e.to));
    const active = !!live;
    const color = live ? routeColorFor(live.routeIndex).edge : NEUTRAL_EDGE;
    const flow = live ? live.dir : e.undirected || e.bidirectional ? "both" : "forward";
    const arrowEnd = live ? live.dir !== "backward" : !e.undirected;
    const arrowStart = live ? live.dir !== "forward" : !!e.bidirectional && !e.undirected;
    const edgeData: LoomEdgeData = { active, color, flow, archDir: edgeDirectionOf(e) };

    return {
      id: `arch-edge-${i}-${e.from}-${e.to}`,
      type: "loomEdge",
      source: e.from,
      target: e.to,
      label: e.label,
      data: edgeData,
      style: { stroke: color, strokeWidth: active ? 2 : 1 },
      ...(arrowEnd ? { markerEnd: { type: MarkerType.ArrowClosed, color } } : {}),
      ...(arrowStart ? { markerStart: { type: MarkerType.ArrowClosed, color } } : {}),
      labelStyle: { fontSize: 11, fill: "var(--loom-text-secondary)" },
    };
  });

  // Lanes (DESIGN_v2 §13): 1 or 2 columns wide, in the top or bottom tier.
  // Headers in hex (§11) align to even-row x (columnX ignores the odd-row
  // shift). The bottom tier's headers sit in the empty row above it.
  const lanes = drawnLanes(architecture);
  const rows = tierRows(architecture);
  const tierStart = (t: 0 | 1) => (t === 1 && rows.bottom ? rows.bottom.start : 0);
  const tierHeight = (t: 0 | 1) => (t === 1 && rows.bottom ? rows.bottom.height : rows.top.height);
  // Top tier: above its first row. Bottom tier: mirrored, below its last
  // row (芝野さん 2026-11-08), so each tier's labels face outward.
  const below = (t: 0 | 1) => t === 1;
  const lastRowY = (t: 0 | 1) => cellToPixel(0, tierStart(t) + tierHeight(t) - 1, layout).y;
  const HEADER_H = 16;
  const headerY = (t: 0 | 1) =>
    below(t) ? lastRowY(t) + geometry.nodeH - HEADER_Y - HEADER_H : cellToPixel(0, tierStart(t), layout).y + HEADER_Y;
  const real = lanes.filter((l) => !l.virtual);
  const laneHeaders: LaneHeader[] = real.map((l) => {
    const same = real.filter((x) => x.tier === l.tier);
    return {
      col: l.index,
      id: l.id,
      label: l.label,
      x: columnX(l.startCol, layout),
      y: headerY(l.tier),
      tierTop: cellToPixel(0, tierStart(l.tier), layout).y,
      w: geometry.nodeW + (l.width - 1) * geometry.pitchX,
      tier: l.tier,
      tierIndex: same.indexOf(l),
      tierCount: same.length,
      width: l.width,
    };
  });

  // Every cell of every lane over its tier's rows — empty cells included,
  // so a lane's tint is continuous rather than only showing where nodes
  // happen to sit. Tint alternates lane by lane within a tier.
  const tiles: LaneTile[] = [];
  lanes.forEach((l) => {
    const parity = lanes.filter((x) => x.tier === l.tier && x.startCol < l.startCol).length;
    for (let dx = 0; dx < l.width; dx++) {
      const col = l.startCol + dx;
      for (let r = 0; r < tierHeight(l.tier); r++) {
        const row = tierStart(l.tier) + r;
        tiles.push({ lane: parity, col, row, ...laneTileRect(col, row, layout) });
      }
      // A flat strip joining the header to the tier's nearest row centre,
      // so the header sits inside its lane's tint.
      if (below(l.tier)) {
        const last = laneTileRect(col, tierStart(l.tier) + tierHeight(l.tier) - 1, layout);
        const top = last.y + last.h / 2;
        const bottom = headerY(l.tier) + HEADER_H + 24;
        tiles.push({ kind: "band", lane: parity, col, row: tierStart(l.tier) + tierHeight(l.tier), x: last.x, y: top, w: last.w, h: bottom - top });
      } else {
        const first = laneTileRect(col, tierStart(l.tier), layout);
        const top = headerY(l.tier) - 24;
        tiles.push({ kind: "band", lane: parity, col, row: tierStart(l.tier) - 1, x: first.x, y: top, w: first.w, h: first.y + first.h / 2 - top });
      }
    }
  });

  return { nodes, edges, laneHeaders, tiles, geometry };
}
