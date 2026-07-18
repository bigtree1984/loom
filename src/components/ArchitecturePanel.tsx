import { useCallback, useEffect, useMemo, useRef } from "react";
import { Background, Controls, ReactFlow, useNodesState, type Edge, type Node, type NodeChange } from "@xyflow/react";
import { LoomArchEdge } from "./LoomArchEdge";
import { LoomArchNode } from "./LoomArchNode";
import { LoomLaneHeader, type LoomLaneHeaderData } from "./LoomLaneHeader";
import { NODE_WIDTH, type LaneHeader } from "../graph/toArchitectureFlow";

const edgeTypes = { loomEdge: LoomArchEdge };
const nodeTypes = { loomArchNode: LoomArchNode, loomLaneHeader: LoomLaneHeader };

const HEADER_Y = -110;

interface Props {
  nodes: Node[];
  edges: Edge[];
  laneHeaders: LaneHeader[];
  onSwapLanes: (index: number) => void;
  onNodeDragEnd: (nodeId: string, position: { x: number; y: number }) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onAddNode: () => void;
  onGroupDoubleClick: (groupId: string) => void;
  onAddGroup: () => void;
}

export function ArchitecturePanel({
  nodes,
  edges,
  laneHeaders,
  onSwapLanes,
  onNodeDragEnd,
  onNodeDoubleClick,
  onAddNode,
  onGroupDoubleClick,
  onAddGroup,
}: Props) {
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
          id: `lane-header-${h.key}`,
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
          style: { width: NODE_WIDTH, pointerEvents: "auto" },
        };
      }),
    [laneHeaders, onSwapLanes],
  );

  return (
    <div className="panel architecture-panel">
      <div className="panel-header">
        <div className="panel-title">アーキテクチャ(空間)</div>
        <div className="panel-header-actions">
          <button onClick={onAddGroup}>+レーン追加</button>
          <button onClick={onAddNode}>+ノード追加</button>
        </div>
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={[...headerNodes, ...rfNodes]}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDoubleClick={(_, node) => {
            if (node.type === "loomLaneHeader") {
              const key = node.id.slice("lane-header-".length);
              if (!key.startsWith("__")) onGroupDoubleClick(key);
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
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
