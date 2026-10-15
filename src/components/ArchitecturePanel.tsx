import { useCallback, useEffect, useMemo, useRef } from "react";
import { Background, Controls, ReactFlow, useNodesState, useReactFlow, type Edge, type Node, type NodeChange } from "@xyflow/react";
import { LoomArchEdge } from "./LoomArchEdge";
import { LoomArchNode } from "./LoomArchNode";
import { LoomLaneHeader, type LoomLaneHeaderData } from "./LoomLaneHeader";
import type { LaneHeader, LaneTile } from "../graph/toArchitectureFlow";
import { LoomLaneTile, type LoomLaneTileData } from "./LoomLaneTile";
import { geometryFor, HEADER_Y } from "../graph/gridGeometry";
import type { ArchLayout } from "../types";

const edgeTypes = { loomEdge: LoomArchEdge };
const nodeTypes = { loomArchNode: LoomArchNode, loomLaneHeader: LoomLaneHeader, loomLaneTile: LoomLaneTile };


/** Re-fits the viewport after a grid <-> hex toggle (positions change, so
 * the old viewport can cut the diagram off). Waits two frames so the new
 * node positions/measurements from setRfNodes are in the store first. */
function FitOnLayoutChange({ layout }: { layout: ArchLayout }) {
  const { fitView } = useReactFlow();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 200 }));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [layout, fitView]);
  return null;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  laneHeaders: LaneHeader[];
  tiles: LaneTile[];
  onSwapLanes: (index: number) => void;
  onNodeDragEnd: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onAddNode: () => void;
  onGroupDoubleClick: (groupId: string) => void;
  onAddGroup: () => void;
  layout: ArchLayout;
  onRelayout: () => void;
  onToggleLayout: () => void;
}

export function ArchitecturePanel({
  nodes,
  edges,
  laneHeaders,
  tiles,
  onSwapLanes,
  onNodeDragEnd,
  onNodeDoubleClick,
  onAddNode,
  onGroupDoubleClick,
  onAddGroup,
  layout,
  onRelayout,
  onToggleLayout,
}: Props) {
  const headerWidth = geometryFor(layout).nodeW;
  const [rfNodes, setRfNodes, onNodesChangeBase] = useNodesState(nodes);

  // Only an id the user has actually dragged keeps its position across a
  // node-list regeneration (e.g. highlight colors changing every step).
  // Matching purely by id previously kept a *stale* position for any node
  // that merely shared an id with one from a *different* document (e.g.
  // "gcs" appearing in two unrelated samples) — this narrows "preserve
  // position" to nodes genuinely moved by this user, in this session.
  const draggedIds = useRef(new Set<string>());

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((c) => {
        if (c.type !== "position") return;
        if (c.dragging) {
          draggedIds.current.add(c.id);
        } else if (draggedIds.current.has(c.id) && c.position) {
          // The final change for a drag (dragging just went false) — snap
          // it to the nearest lane/row and let the caller persist that.
          // Un-mark it as "dragged" so the freeform pixel position it was
          // just dropped at doesn't win over the snapped position the
          // resulting doc update computes.
          draggedIds.current.delete(c.id);
          onNodeDragEnd(c.id, c.position);
        }
      });
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, onNodeDragEnd],
  );

  useEffect(() => {
    setRfNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return nodes.map((n) => {
        const existing = draggedIds.current.has(n.id) ? byId.get(n.id) : undefined;
        return existing ? { ...n, position: existing.position } : n;
      });
    });
  }, [nodes, setRfNodes]);

  // Lane headers are real React Flow nodes (not an HTML overlay) so they
  // pan/zoom in lock-step with the lane they label, positioned above row 0.
  // Not draggable/connectable/selectable, and rebuilt fresh every render —
  // no drag-position bookkeeping needed for them.
  const headerNodes: Node[] = useMemo(
    () =>
      laneHeaders.map((h, i) => {
        const data: LoomLaneHeaderData = {
          label: h.label,
          canMoveLeft: i > 0,
          canMoveRight: i < laneHeaders.length - 1,
          onMoveLeft: () => onSwapLanes(i - 1),
          onMoveRight: () => onSwapLanes(i),
        };
        return {
          id: `lane-header-${h.col}`,
          type: "loomLaneHeader",
          position: { x: h.x, y: HEADER_Y },
          data,
          draggable: false,
          selectable: false,
          connectable: false,
          // React Flow disables pointer-events on a node's wrapper entirely
          // when it's non-draggable/non-selectable/non-connectable with no
          // node-level handlers — correct for a purely decorative node, but
          // this one has real interactive buttons inside it, so it must be
          // forced back on or every click passes through to the pane below.
          style: { width: headerWidth, pointerEvents: "auto" },
        };
      }),
    [laneHeaders, onSwapLanes, headerWidth],
  );

  const tileNodes: Node[] = useMemo(
    () =>
      tiles.map((t) => {
        const data: LoomLaneTileData = { shape: layout === "hex" && !t.kind ? "hex" : "rect", odd: t.col % 2 === 1 };
        return {
          id: t.kind ? `lane-band-${t.col}` : `lane-tile-${t.col}-${t.row}`,
          type: "loomLaneTile",
          position: { x: t.x, y: t.y },
          data,
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          zIndex: -1,
          style: { width: t.w, height: t.h, pointerEvents: "none", padding: 0, border: "none", background: "transparent" },
        };
      }),
    [tiles, layout],
  );

  return (
    <div className="panel architecture-panel">
      <div className="panel-header">
        <div className="panel-title">アーキテクチャ(空間)</div>
        <div className="panel-header-actions">
          <button onClick={onToggleLayout}>{layout === "grid" ? "ハニカム表示" : "グリッド表示"}</button>
          <button onClick={onRelayout}>整列し直す</button>
          <button onClick={onAddGroup}>+列追加</button>
          <button onClick={onAddNode}>+ノード追加</button>
        </div>
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={[...tileNodes, ...headerNodes, ...rfNodes]}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDoubleClick={(_, node) => {
            if (node.type === "loomLaneHeader") {
              const col = Number(node.id.slice("lane-header-".length));
              const header = laneHeaders[col];
              if (header) onGroupDoubleClick(header.id);
              return;
            }
            onNodeDoubleClick(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <FitOnLayoutChange layout={layout} />
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
