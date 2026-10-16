import { useMemo } from "react";
import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { LoomBackEdge } from "./LoomBackEdge";

const edgeTypes = { loomBackEdge: LoomBackEdge };

interface Props {
  nodes: Node[];
  edges: Edge[];
  onTaskClick: (taskId: string) => void;
  /** Click on empty space: drop the current-step highlight. */
  onPaneClick?: () => void;
  onTaskDoubleClick: (taskId: string) => void;
  onAddTask: () => void;
  readOnly?: boolean;
  /** Picking tasks for the task editor: clicks toggle instead of jumping. */
  picking?: { selected: Set<string>; exclude?: string; onPick: (taskId: string) => void } | null;
}

export function ProcessFlowPanel({ nodes, edges, onTaskClick, onPaneClick, onTaskDoubleClick, onAddTask, readOnly = false, picking = null }: Props) {
  const shownNodes = useMemo(
    () =>
      picking
        ? nodes.map((n) => ({
            ...n,
            className: [n.className, n.id !== picking.exclude && "loom-pickable", picking.selected.has(n.id) && "loom-picked"]
              .filter(Boolean)
              .join(" "),
          }))
        : nodes,
    [nodes, picking],
  );
  return (
    <div className={`panel process-flow-panel${picking ? " picking" : ""}`}>
      <div className="panel-header">
        <div className="panel-title">プロセスフロー(時間)</div>
        {!readOnly && <button onClick={onAddTask}>+タスク追加</button>}
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={shownNodes}
          edges={edges}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => {
            if (!picking) onTaskClick(node.id);
            else if (node.id !== picking.exclude) picking.onPick(node.id);
          }}
          onPaneClick={() => {
            if (!picking) onPaneClick?.();
          }}
          onNodeDoubleClick={(_, node) => {
            if (!readOnly && !picking) onTaskDoubleClick(node.id);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
