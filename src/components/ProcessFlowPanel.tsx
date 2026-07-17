import { Background, Controls, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { LoomBackEdge } from "./LoomBackEdge";

const edgeTypes = { loomBackEdge: LoomBackEdge };

interface Props {
  nodes: Node[];
  edges: Edge[];
  onTaskClick: (taskId: string) => void;
  onTaskDoubleClick: (taskId: string) => void;
  onAddTask: () => void;
}

export function ProcessFlowPanel({ nodes, edges, onTaskClick, onTaskDoubleClick, onAddTask }: Props) {
  return (
    <div className="panel process-flow-panel">
      <div className="panel-header">
        <div className="panel-title">プロセスフロー(時間)</div>
        <button onClick={onAddTask}>+タスク追加</button>
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          zoomOnDoubleClick={false}
          onNodeClick={(_, node) => onTaskClick(node.id)}
          onNodeDoubleClick={(_, node) => onTaskDoubleClick(node.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
