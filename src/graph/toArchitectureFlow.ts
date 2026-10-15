import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ArchNodeColorToken, ArchNodeType, LoomDocument } from "../types";
import { cellToPixel, columnX, geometryFor, type CellGeometry } from "./gridGeometry";
import { routeColorFor } from "./routeColors";
import { iconUrlFor } from "./iconRegistry";
import { truncateLabel } from "./textUtils";
import type { ArchNodeHighlight } from "../state/useLoomState";
import type { LoomEdgeData } from "../components/LoomArchEdge";
import type { LoomArchNodeData } from "../components/LoomArchNode";

const MAX_LABEL_CHARS_PER_LINE = 12;
/** Hex nodes are narrower at the label's height (the pointed top/bottom
 * eat into the box), so they get a smaller per-line budget and at most 2
 * lines; the full label stays in the hover tooltip. */
const HEX_MAX_LABEL_CHARS_PER_LINE = 8;
const HEX_MAX_LABEL_LINES = 2;

/** Dot color when a node doesn't specify `colorToken` explicitly — keeps
 * old JSON (authored before colorToken existed) showing a sensible dot
 * derived from its semantic type. */
const COLOR_TOKEN_BY_TYPE: Record<ArchNodeType, ArchNodeColorToken> = {
  frontend: "color_1",
  backend: "color_2",
  agent: "color_3",
  storage: "color_4",
  human: "color_5",
  spacer: "color_1", // v1-only type; normalize drops spacers
};

const NEUTRAL_BORDER = "var(--loom-border)";
const NEUTRAL_EDGE = "var(--loom-neutral-border)";

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

/** Up to 2 lines: an explicit "\n" split is kept, otherwise a single long
 * line wraps into a second line; each line is truncated independently. */
function hexLabel(label: string): string {
  let lines = label.split("\n");
  if (lines.length === 1 && label.length > HEX_MAX_LABEL_CHARS_PER_LINE) {
    lines = [label.slice(0, HEX_MAX_LABEL_CHARS_PER_LINE), label.slice(HEX_MAX_LABEL_CHARS_PER_LINE)];
  }
  if (lines.length > HEX_MAX_LABEL_LINES) {
    lines = [lines[0], `${lines.slice(1).join(" ")}`];
  }
  return truncateLabel(lines.join("\n"), HEX_MAX_LABEL_CHARS_PER_LINE);
}

export function toArchitectureFlow(
  architecture: LoomDocument["architecture"],
  highlightedArchNodes: Map<string, ArchNodeHighlight>,
): { nodes: Node[]; edges: Edge[]; laneHeaders: LaneHeader[]; geometry: CellGeometry } {
  const layout = architecture.layout ?? "grid";
  const geometry = geometryFor(layout);

  const nodes: Node[] = architecture.nodes.map((n) => {
    const position = cellToPixel(n.col ?? 0, n.row ?? 0, layout);
    const highlight = highlightedArchNodes.get(n.id);
    const isMain = highlight?.role === "main";
    const borderColor = highlight ? routeColorFor(highlight.routeIndex)[isMain ? "strong" : "light"].border : NEUTRAL_BORDER;
    const colorToken = n.colorToken ?? COLOR_TOKEN_BY_TYPE[n.type];
    const isHex = layout === "hex";
    const borderWidth = isMain ? 2 : 1;
    const label = isHex
      ? hexLabel(n.label)
      : truncateLabel(n.label, MAX_LABEL_CHARS_PER_LINE);
    const data: LoomArchNodeData = {
      label,
      shape: isHex ? "hex" : "rect",
      borderColor,
      borderWidth,
      fullLabel: n.label,
      dotColor: `var(--loom-dot-${colorToken.slice("color_".length)})`,
      iconUrl: iconUrlFor(n.icon),
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
    const edgeData: LoomEdgeData = { active, color };

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

  return { nodes, edges, laneHeaders, geometry };
}
