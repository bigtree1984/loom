import { useCallback, useEffect, useRef } from "react";
import { Background, Controls, ReactFlow, useNodesState, type Edge, type Node, type NodeChange } from "@xyflow/react";
import { LoomArchEdge } from "./LoomArchEdge";
import { LoomArchNode } from "./LoomArchNode";

const edgeTypes = { loomEdge: LoomArchEdge };
const nodeTypes = { loomArchNode: LoomArchNode };

interface Props {
  nodes: Node[];
  edges: Edge[];
  onNodeDoubleClick: (nodeId: string) => void;
  onAddNode: () => void;
}

export function ArchitecturePanel({ nodes, edges, onNodeDoubleClick, onAddNode }: Props) {
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
        if (c.type === "position" && c.dragging) draggedIds.current.add(c.id);
      });
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase],
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

  return (
    <div className="panel architecture-panel">
      <div className="panel-header">
        <div className="panel-title">アーキテクチャ(空間)</div>
        <button onClick={onAddNode}>+ノード追加</button>
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={rfNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDoubleClick={(_, node) => onNodeDoubleClick(node.id)}
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
