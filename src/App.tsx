import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import sampleDataRaw from "./sample-data/report-agent-system.json";
import type { LoomDocument } from "./types";
import { useLoomState } from "./state/useLoomState";
import { toArchitectureFlow } from "./graph/toArchitectureFlow";
import { toProcessFlow } from "./graph/toProcessFlow";
import { ArchitecturePanel } from "./components/ArchitecturePanel";
import { ProcessFlowPanel } from "./components/ProcessFlowPanel";
import { ControlBar } from "./components/ControlBar";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { JsonUploader } from "./components/JsonUploader";
import { NodeEditorModal } from "./components/NodeEditorModal";
import { TaskEditorModal } from "./components/TaskEditorModal";
import { JsonEditorModal } from "./components/JsonEditorModal";
import { useSampleAutoload } from "./hooks/useSampleAutoload";

const SAMPLE = sampleDataRaw as unknown as LoomDocument;

type EditorState = { kind: "node" | "task"; id: string | null } | { kind: "json" } | null;

function App() {
  const loom = useLoomState(SAMPLE);
  const [editor, setEditor] = useState<EditorState>(null);
  const [autoloadStatus, setAutoloadStatus] = useState<string | null>(null);

  const archFlow = useMemo(() => {
    if (!loom.doc) return { nodes: [], edges: [] };
    return toArchitectureFlow(loom.doc.architecture, loom.doc.flow, loom.highlightedArchNodes);
  }, [loom.doc, loom.highlightedArchNodes]);

  const processFlow = useMemo(() => {
    if (!loom.doc) return { nodes: [], edges: [] };
    return toProcessFlow(loom.doc.flow, loom.archNodesById, loom.displayPosition, loom.routeColorByTask);
  }, [loom.doc, loom.archNodesById, loom.displayPosition, loom.routeColorByTask]);

  const handleLoadSample = useCallback(() => loom.loadDocument(SAMPLE), [loom]);

  const handleEditorSave = useCallback(
    (updated: LoomDocument) => {
      loom.loadDocument(updated);
      setEditor(null);
    },
    [loom],
  );

  useSampleAutoload(
    useCallback(
      (doc, filename) => {
        loom.loadDocument(doc);
        setAutoloadStatus(`${filename} を自動読み込みしました`);
      },
      [loom],
    ),
  );

  useEffect(() => {
    if (!autoloadStatus) return;
    const timer = setTimeout(() => setAutoloadStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [autoloadStatus]);

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Loom</h1>
          <p className="app-tagline">空間という経糸に、時間という緯糸を通す。</p>
        </div>
        <div className="app-header-actions">
          <button onClick={loom.undoEdit} disabled={!loom.canUndoEdit}>
            元に戻す
          </button>
          <button onClick={loom.redoEdit} disabled={!loom.canRedoEdit}>
            やり直す
          </button>
          <button onClick={() => setEditor({ kind: "json" })} disabled={!loom.doc}>
            JSONを表示/編集
          </button>
          <JsonUploader onLoad={loom.loadDocument} onLoadSample={handleLoadSample} />
          {autoloadStatus && <span className="autoload-status">{autoloadStatus}</span>}
        </div>
      </header>

      <div className="app-body">
        <ReactFlowProvider>
          <ProcessFlowPanel
            nodes={processFlow.nodes}
            edges={processFlow.edges}
            onTaskClick={loom.jumpTo}
            onTaskDoubleClick={(id) => setEditor({ kind: "task", id })}
            onAddTask={() => setEditor({ kind: "task", id: null })}
          />
        </ReactFlowProvider>
        <div className="architecture-column">
          <ReactFlowProvider>
            <ArchitecturePanel
              nodes={archFlow.nodes}
              edges={archFlow.edges}
              onNodeDoubleClick={(id) => setEditor({ kind: "node", id })}
              onAddNode={() => setEditor({ kind: "node", id: null })}
            />
          </ReactFlowProvider>
          <TaskDetailPanel tasks={loom.currentTasks} routeColorByTask={loom.routeColorByTask} />
        </div>
      </div>

      <footer className="app-footer">
        <ControlBar
          canGoBack={loom.canGoBack}
          goBack={loom.goBack}
          goNext={loom.goNext}
          pendingDecisions={loom.pendingDecisions}
          choose={loom.choose}
          isPlaying={loom.isPlaying}
          togglePlay={loom.togglePlay}
          isComplete={loom.isComplete}
        />
      </footer>

      {editor?.kind === "node" && loom.doc && (
        <NodeEditorModal doc={loom.doc} nodeId={editor.id} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === "task" && loom.doc && (
        <TaskEditorModal doc={loom.doc} taskId={editor.id} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === "json" && loom.doc && (
        <JsonEditorModal doc={loom.doc} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}

export default App;
