import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import sampleDataRaw from "./sample-data/pattern-showcase.json";
import type { LoomDocument } from "./types";
import { useLoomState } from "./state/useLoomState";
import { NoteExportMenu } from "./export/NoteExportMenu";
import { toArchitectureFlow } from "./graph/toArchitectureFlow";
import { addEdge, moveColumn, moveNodeToCell, removeEdgeAt, reverseEdgeAt, swapColumns } from "./graph/gridEdits";
import { clearPlacement } from "./graph/normalizeDocument";
import { geometryFor, pixelToCell } from "./graph/gridGeometry";
import { applyThemeToRoot } from "./graph/theme";
import { toProcessFlow } from "./graph/toProcessFlow";
import { ArchitecturePanel } from "./components/ArchitecturePanel";
import { NoteView } from "./components/NoteView";
import { moveNodeToNoteCell, resetNoteCells } from "./graph/noteCells";
import { ProcessFlowPanel } from "./components/ProcessFlowPanel";
import { ControlBar } from "./components/ControlBar";
import { TaskDetailPanel } from "./components/TaskDetailPanel";
import { JsonUploader } from "./components/JsonUploader";
import { NodeEditorModal } from "./components/NodeEditorModal";
import { TaskEditorModal, type PickTarget } from "./components/TaskEditorModal";
import { GroupEditorModal } from "./components/GroupEditorModal";
import { JsonEditorModal } from "./components/JsonEditorModal";
import { useSampleAutoload } from "./hooks/useSampleAutoload";
import { compactForPresent } from "./graph/presentLayout";
import { Modal } from "./components/Modal";
import {
  decodeShareFromLocationHash,
  encodeDocToShareUrl,
  readModeFromLocationHash,
  withModeInHash,
  type LoomMode,
} from "./urlShare";

const SAMPLE = sampleDataRaw as unknown as LoomDocument;

const EMPTY_ARCH = { nodes: [], edges: [], laneHeaders: [], tiles: [], geometry: geometryFor("grid") };

const PICK_LABEL: Record<PickTarget, string> = {
  main: "軸ノード",
  input: "入力ノード",
  output: "出力ノード",
  prev: "前タスク",
  next: "後ろタスク",
};

interface PickState {
  target: PickTarget;
  selected: string[];
  apply: (ids: string[]) => void;
}

type EditorState = { kind: "node" | "task" | "group"; id: string | null } | { kind: "json" } | null;

function App() {
  const loom = useLoomState(SAMPLE);
  const [editor, setEditor] = useState<EditorState>(null);
  const [autoloadStatus, setAutoloadStatus] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  // Mode lives in the URL fragment. A link carrying a doc but no mode is a
  // shared link -> "present"; a fresh visit (no doc) -> "edit".
  const [mode, setMode] = useState<LoomMode>(
    () => readModeFromLocationHash() ?? (location.hash.startsWith("#doc=") ? "present" : "edit"),
  );
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  // Task editor's "選択" buttons: the editor hides (staying mounted) while
  // the user clicks nodes/tasks on the diagrams.
  const [pick, setPick] = useState<PickState | null>(null);
  const startPick = useCallback(
    (target: PickTarget, current: string[], apply: (ids: string[]) => void) => setPick({ target, selected: current, apply }),
    [],
  );
  const togglePick = useCallback((id: string) => {
    setPick((p) => {
      if (!p) return p;
      // 軸ノード is a single choice: one click picks it and finishes.
      if (p.target === "main") {
        p.apply([id]);
        return null;
      }
      return { ...p, selected: p.selected.includes(id) ? p.selected.filter((x) => x !== id) : [...p.selected, id] };
    });
  }, []);
  const finishPick = useCallback(() => {
    setPick((p) => {
      p?.apply(p.selected);
      return null;
    });
  }, []);
  const pickingArch = pick && (pick.target === "main" || pick.target === "input" || pick.target === "output");
  const pickingFlow = pick && (pick.target === "prev" || pick.target === "next");
  const pickedSet = useMemo(() => new Set(pick?.selected ?? []), [pick]);
  useEffect(() => {
    if (!pick) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPick(null);
      else if (e.key === "Enter") finishPick();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pick, finishPick]);
  const [menuOpen, setMenuOpen] = useState(false);
  const present = mode === "present";
  const note = mode === "note";

  const handleSetMode = useCallback((next: LoomMode) => {
    setMode(next);
    setMenuOpen(false);
    history.replaceState(null, "", `${location.pathname}${location.search}${withModeInHash(location.hash, next)}`);
  }, []);

  // A shared link carries its document entirely in the URL fragment (never
  // sent to the server — see src/urlShare.ts), so loading one just means
  // decoding location.hash once at startup, no network round-trip.
  useEffect(() => {
    void (async () => {
      try {
        const fromHash = await decodeShareFromLocationHash();
        if (fromHash) {
          loom.loadDocument(fromHash.doc);
          setMode(fromHash.mode);
        }
      } catch {
        setShareStatus("共有リンクの読み込みに失敗しました");
      }
    })();
    // Only read the hash once, on the document this tab was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyShareLink = useCallback((linkMode: LoomMode) => {
    if (!loom.doc) return;
    setShareDialogOpen(false);
    void (async () => {
      let url: string;
      try {
        url = await encodeDocToShareUrl(loom.doc!, linkMode);
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

  // Per-document colour overrides (LoomDocument.theme) re-brand the whole
  // app: they're set as --bt-* on <html>, from which theme.css derives the
  // rest (routes, lane tints, dark mode).
  const theme = loom.doc?.theme;
  useEffect(() => applyThemeToRoot(theme), [theme]);

  const archFlow = useMemo(() => {
    if (!loom.doc) return EMPTY_ARCH;
    // Present mode renders a compacted copy (empty columns skipped); the
    // document itself is never touched.
    const arch = present ? compactForPresent(loom.doc.architecture) : loom.doc.architecture;
    return toArchitectureFlow(arch, loom.highlightedArchNodes, !present);
  }, [loom.doc, loom.highlightedArchNodes, present]);

  // Swaps column `index` with its right-hand neighbour — header and every
  // node in both columns move together.
  const handleSwapLanes = useCallback(
    (index: number) => {
      if (loom.doc) loom.loadDocument(swapColumns(loom.doc, index));
    },
    [loom],
  );

  const handleMoveLane = useCallback(
    (from: number, to: number) => {
      if (loom.doc) loom.loadDocument(moveColumn(loom.doc, from, to));
    },
    [loom],
  );

  const handleConnectNodes = useCallback(
    (from: string, to: string) => {
      if (loom.doc) loom.loadDocument(addEdge(loom.doc, from, to));
    },
    [loom],
  );
  const handleDeleteEdge = useCallback(
    (index: number) => {
      if (loom.doc) loom.loadDocument(removeEdgeAt(loom.doc, index));
    },
    [loom],
  );
  const handleReverseEdge = useCallback(
    (index: number) => {
      if (loom.doc) loom.loadDocument(reverseEdgeAt(loom.doc, index));
    },
    [loom],
  );

  // Dropping a node snaps it to the nearest cell; if that cell is taken the
  // two nodes trade places, so a drop never stacks nodes.
  const handleNodeDragEnd = useCallback(
    (nodeId: string, position: { x: number; y: number }) => {
      if (!loom.doc) return;
      const { col, row } = pixelToCell(position.x, position.y, loom.doc.architecture.layout ?? "grid");
      loom.loadDocument(moveNodeToCell(loom.doc, nodeId, col, row));
    },
    [loom],
  );

  // 整列し直す: forget every cell and rerun the automatic layout, keeping
  // each node's current column as its grouping hint.
  const handleRelayout = useCallback(() => {
    if (loom.doc) loom.loadDocument(clearPlacement(loom.doc));
  }, [loom]);

  const handleToggleLayout = useCallback(() => {
    if (!loom.doc) return;
    const next = (loom.doc.architecture.layout ?? "grid") === "grid" ? "hex" : "grid";
    loom.loadDocument({ ...loom.doc, architecture: { ...loom.doc.architecture, layout: next } });
  }, [loom]);

  // note挿絵 view: only noteCol/noteRow change, never the screen col/row.
  const handleNoteMove = useCallback(
    (nodeId: string, col: number, row: number) => {
      if (loom.doc) loom.loadDocument(moveNodeToNoteCell(loom.doc, nodeId, col, row));
    },
    [loom],
  );
  const handleNoteReset = useCallback(() => {
    if (loom.doc) loom.loadDocument(resetNoteCells(loom.doc));
  }, [loom]);

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
          {present ? (
            <div className="menu-wrap">
              <button onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
                メニュー
              </button>
              {menuOpen && (
                <div className="menu-dropdown">
                  <button onClick={loom.undoEdit} disabled={!loom.canUndoEdit}>
                    元に戻す
                  </button>
                  <button onClick={loom.redoEdit} disabled={!loom.canRedoEdit}>
                    やり直す
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setEditor({ kind: "json" });
                    }}
                    disabled={!loom.doc}
                  >
                    JSONを表示/編集
                  </button>
                  <JsonUploader onLoad={loom.loadDocument} onLoadSample={handleLoadSample} />
                </div>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
          <button onClick={() => setShareDialogOpen(true)} disabled={!loom.doc}>
            共有リンクをコピー
          </button>
          <NoteExportMenu doc={loom.doc} currentTasks={loom.currentTasks} highlightedArchNodes={loom.highlightedArchNodes} />
          <div className="mode-switch" role="group" aria-label="モード">
            {(
              [
                ["edit", "編集"],
                ["present", "プレゼン"],
                ["note", "note挿絵"],
              ] as const
            ).map(([m, label]) => (
              <button key={m} onClick={() => handleSetMode(m)} aria-pressed={mode === m}>
                {label}
              </button>
            ))}
          </div>
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
            readOnly={present}
            picking={
              pickingFlow
                ? { selected: pickedSet, exclude: editor?.kind === "task" ? editor.id ?? undefined : undefined, onPick: togglePick }
                : null
            }
          />
        </ReactFlowProvider>
        <div className="architecture-column">
          {note && loom.doc ? (
            <NoteView
              doc={loom.doc}
              currentTasks={loom.currentTasks}
              highlight={loom.highlightedArchNodes}
              onMoveNode={handleNoteMove}
              onReset={handleNoteReset}
              onToggleLayout={handleToggleLayout}
            />
          ) : (
          <ReactFlowProvider>
              <ArchitecturePanel
                nodes={archFlow.nodes}
                edges={archFlow.edges}
                laneHeaders={archFlow.laneHeaders}
                tiles={archFlow.tiles}
                onSwapLanes={handleSwapLanes}
                onMoveLane={handleMoveLane}
                onConnectNodes={handleConnectNodes}
                onDeleteEdge={handleDeleteEdge}
                onReverseEdge={handleReverseEdge}
                onNodeDragEnd={handleNodeDragEnd}
                onNodeDoubleClick={(id) => setEditor({ kind: "node", id })}
                onAddNode={() => setEditor({ kind: "node", id: null })}
                onGroupDoubleClick={(id) => setEditor({ kind: "group", id })}
                onAddGroup={() => setEditor({ kind: "group", id: null })}
                layout={loom.doc?.architecture.layout ?? "grid"}
                onRelayout={handleRelayout}
                onToggleLayout={handleToggleLayout}
                readOnly={present}
                picking={pickingArch ? { selected: pickedSet, onPick: togglePick } : null}
              />
            </ReactFlowProvider>
          )}
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
          large={present}
        />
      </footer>

      {shareDialogOpen && (
        <Modal title="共有リンクの種類" onClose={() => setShareDialogOpen(false)}>
          <div className="share-choices">
            <button onClick={() => handleCopyShareLink("present")}>プレゼン用(閲覧)</button>
            <button onClick={() => handleCopyShareLink("edit")}>編集用</button>
          </div>
        </Modal>
      )}

      {pick && (
        <div className="pick-banner" role="status">
          <span>
            {PICK_LABEL[pick.target]}を選択中
            {pick.target !== "main" && `(${pick.selected.length}件)`} —{" "}
            {pickingArch ? "アーキテクチャ図のノード" : "フロー図のタスク"}をクリック
          </span>
          {pick.target !== "main" && (
            <button className="control-choice forward" onClick={finishPick}>
              完了
            </button>
          )}
          <button onClick={() => setPick(null)}>キャンセル</button>
        </div>
      )}

      {editor?.kind === "node" && loom.doc && (
        <NodeEditorModal doc={loom.doc} nodeId={editor.id} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === "task" && loom.doc && (
        <TaskEditorModal
          doc={loom.doc}
          taskId={editor.id}
          onSave={handleEditorSave}
          onClose={() => setEditor(null)}
          onPick={startPick}
          canPickArch={!note}
          hidden={!!pick}
        />
      )}
      {editor?.kind === "group" && loom.doc && (
        <GroupEditorModal doc={loom.doc} groupId={editor.id} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
      {editor?.kind === "json" && loom.doc && (
        <JsonEditorModal doc={loom.doc} onSave={handleEditorSave} onClose={() => setEditor(null)} />
      )}
    </div>
  );
}

export default App;
