import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type { ArchNode, LoomDocument } from "../types";
import { layoutWithDagre } from "./layout";
import { findBackEdgeKeys } from "./graphUtils";
import { routeColorFor } from "./routeColors";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 52;

const NEUTRAL = { bg: "#F1EFE8", border: "#B4B2A9", text: "#5F5E5A" };
const NEUTRAL_EDGE = "#B4B2A9";

export function toProcessFlow(
  flow: LoomDocument["flow"],
  archNodesById: Map<string, ArchNode>,
  displayPosition: string[],
  routeColorByTask: Map<string, number>,
): { nodes: Node[]; edges: Edge[] } {
  const taskIds = flow.tasks.map((t) => t.id);
  const backEdgeKeys = findBackEdgeKeys(taskIds, flow.connections);

  // Loop-backs are excluded from the layout graph so the main acyclic chain
  // lays out straight; they're still drawn afterward using whatever
  // positions that acyclic layout settles on.
  const forwardConnections = flow.connections.filter((c) => !backEdgeKeys.has(`${c.from}::${c.to}`));
  const positions = layoutWithDagre(
    taskIds,
    forwardConnections.map((c) => ({ source: c.from, target: c.to })),
    {
      direction: "TB",
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      nodesep: 20,
      ranksep: 48,
      // dagre's own rankers pack slack nodes as LATE as possible, which
      // pulls a fork's shorter branch down toward wherever it joins
      // instead of aligning it with its sibling right after the fork.
      asapRanks: true,
    },
  );

  const activeSet = new Set(displayPosition);

  // Both the direct predecessor(s) and successor(s) of the current task(s)
  // get the secondary (light) highlight, tagged with whichever active
  // neighbor's route color they're adjacent to — purely derived from the
  // current position, not a sticky "ever visited" history. A task adjacent
  // to two different active routes at once keeps the lowest routeIndex
  // (same tie-break as the architecture panel's main-node collisions).
  const adjacentRouteIndex = new Map<string, number>();
  const claimAdjacent = (id: string, routeIndex: number | undefined) => {
    if (routeIndex === undefined) return;
    const existing = adjacentRouteIndex.get(id);
    if (existing === undefined || routeIndex < existing) adjacentRouteIndex.set(id, routeIndex);
  };
  flow.connections.forEach((c) => {
    if (activeSet.has(c.to) && !activeSet.has(c.from)) claimAdjacent(c.from, routeColorByTask.get(c.to));
    if (activeSet.has(c.from) && !activeSet.has(c.to)) claimAdjacent(c.to, routeColorByTask.get(c.from));
  });

  const nodes: Node[] = flow.tasks.map((t) => {
    const isActive = activeSet.has(t.id);
    const routeIndex = routeColorByTask.get(t.id);
    const adjRouteIndex = adjacentRouteIndex.get(t.id);
    const palette =
      isActive && routeIndex !== undefined
        ? routeColorFor(routeIndex).strong
        : !isActive && adjRouteIndex !== undefined
          ? routeColorFor(adjRouteIndex).light
          : NEUTRAL;
    const isHumanGate = archNodesById.get(t.mainNode)?.type === "human";
    return {
      id: t.id,
      position: positions.get(t.id) ?? { x: 0, y: 0 },
      data: { label: isHumanGate ? `${t.label}(人間)` : t.label },
      className: "loom-task-clickable",
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        background: palette.bg,
        border: `${isActive ? 2 : 1}px solid ${palette.border}`,
        borderRadius: 8,
        color: palette.text,
        fontWeight: isActive ? 600 : 500,
        fontSize: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: 6,
        cursor: "pointer",
      },
    };
  });

  const edges: Edge[] = flow.connections.map((c, i) => {
    const fromRoute = activeSet.has(c.from) ? routeColorByTask.get(c.from) : undefined;
    const toRoute = activeSet.has(c.to) ? routeColorByTask.get(c.to) : undefined;
    const routeIndex = [fromRoute, toRoute].filter((v): v is number => v !== undefined).sort((a, b) => a - b)[0];
    const highlighted = routeIndex !== undefined;
    const color = highlighted ? routeColorFor(routeIndex).edge : NEUTRAL_EDGE;
    const isDecision = !!c.label;
    const isBackEdge = backEdgeKeys.has(`${c.from}::${c.to}`);
    return {
      id: `flow-edge-${i}-${c.from}-${c.to}`,
      source: c.from,
      target: c.to,
      type: isBackEdge ? "loomBackEdge" : undefined,
      label: c.label,
      animated: highlighted,
      style: {
        stroke: color,
        strokeWidth: highlighted ? 2 : 1,
        strokeDasharray: isDecision && !highlighted ? "4 4" : undefined,
      },
      labelStyle: { fontSize: 10, fill: "var(--loom-text-secondary)" },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    };
  });

  return { nodes, edges };
}
