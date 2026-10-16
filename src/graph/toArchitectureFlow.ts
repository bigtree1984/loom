import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { LoomDocument } from "../types";
import { cellToPixel, columnX, geometryFor, HEADER_Y, laneTileRect, type CellGeometry } from "./gridGeometry";
import { routeColorFor } from "./routeColors";
import { iconUrlFor } from "./iconRegistry";
import { truncateLabel } from "./textUtils";
import type { ArchNodeHighlight } from "../state/useLoomState";
import type { LoomEdgeData } from "../components/LoomArchEdge";
import type { LoomArchNodeData } from "../components/LoomArchNode";

const MAX_LABEL_CHARS_PER_LINE = 12;


const NEUTRAL_BORDER = "var(--loom-border)";
const NEUTRAL_EDGE = "var(--loom-neutral-border)";

export interface LaneTile {
  /** "band" = the strip behind the column header, joining it to the tiles. */
  kind?: "band";
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LaneHeader {
  /** Column index. */
  col: number;
  id: string;
  label: string;
  x: number;
}

/** If both ends of an edge belong to the same route (one is that route's
 * main node, the other its io node), the edge is "live" for that route. */
function edgeRouteIndex(a: ArchNodeHighlight | undefined, b: ArchNodeHighlight | undefined): number | null {
  if (!a || !b || a.routeIndex !== b.routeIndex) return null;
  if (a.role === "main" && b.role === "io") return a.routeIndex;
  if (b.role === "main" && a.role === "io") return b.routeIndex;
  return null;
}

export function toArchitectureFlow(
  architecture: LoomDocument["architecture"],
  highlightedArchNodes: Map<string, ArchNodeHighlight>,
  editable = false,
): { nodes: Node[]; edges: Edge[]; laneHeaders: LaneHeader[]; tiles: LaneTile[]; geometry: CellGeometry } {
  const layout = architecture.layout ?? "grid";
  const geometry = geometryFor(layout);

  const nodes: Node[] = architecture.nodes.map((n) => {
    const position = cellToPixel(n.col ?? 0, n.row ?? 0, layout);
    const highlight = highlightedArchNodes.get(n.id);
    const isMain = highlight?.role === "main";
    const borderColor = highlight ? routeColorFor(highlight.routeIndex)[isMain ? "strong" : "light"].border : NEUTRAL_BORDER;
    const isHex = layout === "hex";
    const borderWidth = isMain ? 2 : 1;
    // Hex: hand the full label to CSS (2-line clamp with ellipsis) so the
    // wrap point and the "…" always agree — counting characters in JS
    // couldn't know where the browser would actually wrap.
    const label = isHex ? n.label : truncateLabel(n.label, MAX_LABEL_CHARS_PER_LINE);
    const data: LoomArchNodeData = {
      label,
      shape: isHex ? "hex" : "rect",
      borderColor,
      borderWidth,
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
        background: isHex ? "transparent" : "var(--loom-panel-bg)",
        border: isHex ? "none" : `${borderWidth}px solid ${borderColor}`,
        borderRadius: isHex ? 0 : 8,
        color: "var(--loom-text-primary)",
        fontWeight: isMain ? 600 : 500,
        fontSize: 13,
        opacity: highlight ? 1 : 0.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: isHex ? "8px 22px" : 8,
      },
    };
  });

  const edges: Edge[] = architecture.edges.map((e, i) => {
    const routeIndex = edgeRouteIndex(highlightedArchNodes.get(e.from), highlightedArchNodes.get(e.to));
    const active = routeIndex !== null;
    const color = active ? routeColorFor(routeIndex!).edge : NEUTRAL_EDGE;
    const edgeData: LoomEdgeData = { active, color, bidirectional: !!e.bidirectional };

    return {
      id: `arch-edge-${i}-${e.from}-${e.to}`,
      type: "loomEdge",
      source: e.from,
      target: e.to,
      label: e.label,
      data: edgeData,
      style: { stroke: color, strokeWidth: active ? 2 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color },
      ...(e.bidirectional ? { markerStart: { type: MarkerType.ArrowClosed, color } } : {}),
      labelStyle: { fontSize: 11, fill: "var(--loom-text-secondary)" },
    };
  });

  // Column headers in hex (DESIGN_v2 §11): kept, aligned to even-row x
  // (columnX ignores the odd-row shift). Odd rows sit half a pitch right, so
  // a header labels the column "starting" at row 0 — readable as a lane
  // marker, and hiding them would also hide the lane reorder buttons.
  const laneHeaders: LaneHeader[] = architecture.columns.map((c, col) => ({
    col,
    id: c.id,
    label: c.label,
    x: columnX(col, layout),
  }));

  // Every cell from row 0 to the lowest used row, in every column that has
  // a header or a node — empty cells included, so a column's tint is
  // continuous rather than only showing where nodes happen to sit.
  const colCount = Math.max(architecture.columns.length, ...architecture.nodes.map((n) => (n.col ?? 0) + 1));
  const rowCount = Math.max(1, ...architecture.nodes.map((n) => (n.row ?? 0) + 1));
  const tiles: LaneTile[] = [];
  for (let col = 0; col < colCount; col++)
    for (let row = 0; row < rowCount; row++) tiles.push({ col, row, ...laneTileRect(col, row, layout) });
  // A flat strip from just above the header down to row 0's centre, so the
  // header sits inside its lane's tint (it covers hex row 0's pointed top).
  for (let col = 0; col < colCount; col++) {
    const first = laneTileRect(col, 0, layout);
    const top = HEADER_Y - 24;
    tiles.push({ kind: "band", col, row: -1, x: first.x, y: top, w: first.w, h: first.y + first.h / 2 - top });
  }

  return { nodes, edges, laneHeaders, tiles, geometry };
}
