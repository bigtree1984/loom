import type { Edge, Node } from "@xyflow/react";
import type { ArchNodeColorToken, ArchNodeType, LoomDocument } from "../types";
import { computeStableOrder, layoutByLanes, type LaneLayoutResult } from "./layout";
import { routeColorFor } from "./routeColors";
import { iconUrlFor } from "./iconRegistry";
import { truncateLabel } from "./textUtils";
import type { ArchNodeHighlight } from "../state/useLoomState";
import type { LoomEdgeData } from "../components/LoomArchEdge";
import type { LoomArchNodeData } from "../components/LoomArchNode";

export const NODE_WIDTH = 168;
const NODE_HEIGHT = 64;
const MAX_LABEL_CHARS_PER_LINE = 12;

/** Dot color when a node doesn't specify `colorToken` explicitly — keeps
 * old JSON (authored before colorToken existed) showing a sensible dot
 * derived from its semantic type. */
const COLOR_TOKEN_BY_TYPE: Record<ArchNodeType, ArchNodeColorToken> = {
  frontend: "color_1",
  backend: "color_2",
  agent: "color_3",
  storage: "color_4",
  human: "color_5",
  spacer: "color_1", // never actually rendered — a spacer has no dot
};

const NEUTRAL_BORDER = "var(--loom-border)";
const NEUTRAL_EDGE = "#B4B2A9";

const TYPE_LABEL: Record<ArchNodeType, string> = {
  human: "人間",
  frontend: "フロントエンド",
  backend: "バックエンド",
  agent: "エージェント",
  storage: "データ",
  spacer: "空白",
};

/** Human-readable label for a lane key — a declared group's label, or a
 * generated one for the human/type-fallback lanes (see LaneLayoutResult). */
function laneLabelFor(key: string, groups: LoomDocument["architecture"]["groups"]): string {
  if (key === "__human__") return TYPE_LABEL.human;
  if (key.startsWith("__type_")) {
    const type = key.slice("__type_".length) as ArchNodeType;
    return TYPE_LABEL[type] ?? key;
  }
  return groups?.find((g) => g.id === key)?.label ?? key;
}

export interface LaneHeader {
  key: string;
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
  flow: LoomDocument["flow"],
  highlightedArchNodes: Map<string, ArchNodeHighlight>,
): { nodes: Node[]; edges: Edge[]; layout: LaneLayoutResult; laneHeaders: LaneHeader[] } {
  // Each pipeline task's step order (from the flow panel's own ranking)
  // becomes the definite sort key for whichever architecture node it
  // runs on — the one node in each lane's ordering that isn't a guess.
  const taskOrder = computeStableOrder(
    flow.tasks.map((t) => t.id),
    flow.connections.map((c) => ({ source: c.from, target: c.to })),
  );
  const taskOrderByMainNode = new Map<string, number>();
  flow.tasks.forEach((t) => {
    const ord = taskOrder.get(t.id);
    if (ord === undefined) return;
    const existing = taskOrderByMainNode.get(t.mainNode);
    if (existing === undefined || ord < existing) taskOrderByMainNode.set(t.mainNode, ord);
  });

  const layout = layoutByLanes(
    architecture.nodes.map((n) => ({ id: n.id, type: n.type, group: n.group, rowOrder: n.rowOrder })),
    architecture.edges,
    (architecture.groups ?? []).map((g) => g.id),
    taskOrderByMainNode,
    { width: NODE_WIDTH, height: NODE_HEIGHT },
    architecture.laneOrder,
  );
  const positions = layout.positions;

  const nodes: Node[] = architecture.nodes.map((n) => {
    if (n.type === "spacer") {
      const data: LoomArchNodeData = { label: "", fullLabel: "", dotColor: "", isSpacer: true };
      return {
        id: n.id,
        type: "loomArchNode",
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data,
        connectable: false,
        style: {
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          background: "transparent",
          border: "1px dashed var(--loom-border)",
          borderRadius: 8,
          opacity: 0.5,
        },
      };
    }
    const highlight = highlightedArchNodes.get(n.id);
    const isMain = highlight?.role === "main";
    const borderColor = highlight ? routeColorFor(highlight.routeIndex)[isMain ? "strong" : "light"].border : NEUTRAL_BORDER;
    const colorToken = n.colorToken ?? COLOR_TOKEN_BY_TYPE[n.type];
    const data: LoomArchNodeData = {
      label: truncateLabel(n.label, MAX_LABEL_CHARS_PER_LINE),
      fullLabel: n.label,
      dotColor: `var(--loom-dot-${colorToken.slice("color_".length)})`,
      iconUrl: iconUrlFor(n.icon),
    };
    return {
      id: n.id,
      type: "loomArchNode",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data,
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: "var(--loom-panel-bg)",
        border: `${isMain ? 2 : 1}px solid ${borderColor}`,
        borderRadius: 8,
        color: "var(--loom-text-primary)",
        fontWeight: isMain ? 600 : 500,
        fontSize: 13,
        opacity: highlight ? 1 : 0.6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 8,
      },
    };
  });

  const edges: Edge[] = architecture.edges.map((e, i) => {
    const routeIndex = edgeRouteIndex(highlightedArchNodes.get(e.a), highlightedArchNodes.get(e.b));
    const active = routeIndex !== null;
    const color = active ? routeColorFor(routeIndex!).edge : NEUTRAL_EDGE;
    const edgeData: LoomEdgeData = { active, color };

    return {
      id: `arch-edge-${i}-${e.a}-${e.b}`,
      type: "loomEdge",
      source: e.a,
      target: e.b,
      label: e.label,
      data: edgeData,
      style: { stroke: color, strokeWidth: active ? 2 : 1 },
      labelStyle: { fontSize: 11, fill: "var(--loom-text-secondary)" },
    };
  });

  const laneHeaders: LaneHeader[] = layout.laneOrder.map((key) => ({
    key,
    label: laneLabelFor(key, architecture.groups),
    x: layout.laneX.get(key) ?? 0,
  }));

  return { nodes, edges, layout, laneHeaders };
}
