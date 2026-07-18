import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import sampleDataRaw from "./sample-data/report-agent-system.json";
import type { LoomDocument } from "./types";
import { useLoomState } from "./state/useLoomState";
import { toArchitectureFlow } from "./graph/toArchitectureFlow";
import { snapPositionToLane, validLaneKeysFor, HUMAN_LANE, type LaneLayoutResult } from "./graph/layout";
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
import { decodeDocFromLocationHash, encodeDocToShareUrl } from "./urlShare";

const SAMPLE = sampleDataRaw as unknown as LoomDocument;

const EMPTY_LANE_LAYOUT: LaneLayoutResult = {
  positions: new Map(),
  laneOrder: [],
  laneX: new Map(),
  rowHeight: 0,
  laneGap: 0,
  nodeWidth: 0,
};

type EditorState = { kind: "node" | "task"; id: string | null } | { kind: "json" } | null;

function App() {
  const loom = useLoomState(SAMPLE);
  const [editor, setEditor] = useState<EditorState>(null);
  const [autoloadStatus, setAutoloadStatus] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  // A shared link carries its document entirely in the URL fragment (never
  // sent to the server — see src/urlShare.ts), so loading one just means
  // decoding location.hash once at startup, no network round-trip.
  useEffect(() => {
    void (async () => {
      try {
        const fromHash = await decodeDocFromLocationHash();
        if (fromHash) loom.loadDocument(fromHash);
      } catch {
        setShareStatus("共有リンクの読み込みに失敗しました");
      }
    })();
    // Only read the hash once, on the document this tab was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyShareLink = useCallback(() => {
    if (!loom.doc) return;
    void (async () => {
      let url: string;
      try {
        url = await encodeDocToShareUrl(loom.doc!);
      } catch {
        setShareStatus("共有リンクの作成に失敗しました");
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareStatus("共有リンクをコピーしました");
      } catch {
        // Clipboard access can be blocked (permissions, non-secure context,
        // some embedded browsers) even though the link itself was built
        // fine — fall back to showing it so the user can copy by hand.
        window.prompt("コピーできませんでした。手動でコピーしてください:", url);
      }
    })();
  }, [loom]);

  useEffect(() => {
    if (!shareStatus) return;
    const timer = setTimeout(() => setShareStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [shareStatus]);

  const archFlow = useMemo(() => {
    if (!loom.doc) return { nodes: [], edges: [], layout: EMPTY_LANE_LAYOUT, laneHeaders: [] };
    return toArchitectureFlow(loom.doc.architecture, loom.doc.flow, loom.highlightedArchNodes);
  }, [loom.doc, loom.highlightedArchNodes]);

  // Swaps lane `index` with its right-hand neighbor and pins the result as
  // an explicit architecture.laneOrder override — whatever was showing
  // (auto-optimized or already-pinned) becomes the new baseline the user
  // is nudging, rather than the swap getting silently recomputed away.
  const handleSwapLanes = useCallback(
    (index: number) => {
      if (!loom.doc) return;
      const order = [...archFlow.layout.laneOrder];
      if (index < 0 || index + 1 >= order.length) return;
      [order[index], order[index + 1]] = [order[index + 1], order[index]];
      loom.loadDocument({
        ...loom.doc,
        architecture: { ...loom.doc.architecture, laneOrder: order },
      });
    },
    [loom, archFlow.layout.laneOrder],
  );

  // Dropping a dragged node snaps it to the nearest lane/row instead of a
  // freeform pixel position — group (or its absence, to fall back to the
  // node's own type lane) and rowOrder get written back, restricted to
  // lanes that actually make sense for this node's type (see
  // validLaneKeysFor) so a drop can't produce a group value that silently
  // lies about where the node visually landed.
  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!loom.doc) return;
      const node = loom.doc.architecture.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const validLanes = validLaneKeysFor(node.type, archFlow.layout.laneOrder);
      const { laneKey, rowOrder } = snapPositionToLane(position, validLanes, archFlow.layout.laneX, archFlow.layout.rowHeight);
      const newGroup = laneKey === HUMAN_LANE || laneKey.startsWith("__type_") ? undefined : laneKey;
      loom.loadDocument({
        ...loom.doc,
        architecture: {
          ...loom.doc.architecture,
          nodes: loom.doc.architecture.nodes.map((n) => (n.id === nodeId ? { ...n, group: newGroup, rowOrder } : n)),
        },
      });
    },
    [loom, archFlow.layout],
  );

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
          <button onClick={handleCopyShareLink} disabled={!loom.doc}>
            共有リンクをコピー
          </button>
          <a href="/AGENT_GUIDE.md" target="_blank" rel="noopener noreferrer" className="agent-guide-link">
            エージェント向け仕様
          </a>
          {(autoloadStatus || shareStatus) && (
            <span className="autoload-status">{autoloadStatus ?? shareStatus}</span>
          )}
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
              laneHeaders={archFlow.laneHeaders}
              onSwapLanes={handleSwapLanes}
              onNodeDragEnd={handleNodeDragEnd}
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
