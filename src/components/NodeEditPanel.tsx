import { useState } from "react";
import type { ArchEdge, ArchNode, ArchNodeType, Artifact, LoomDocument } from "../types";
import { memberships } from "../graph/lanes";
import { IconPicker } from "./IconPicker";
import { InitialArtifacts, NODE_TYPES } from "./NodeEditorModal";

/**
 * Side editor for one architecture node (DESIGN_v3 §4 item 8): the same
 * fields as the old dialog, but edited live — every change goes straight
 * into the document and the playback, undone with 元に戻す.
 */

interface Props {
  doc: LoomDocument;
  nodeId: string;
  onEdit: (doc: LoomDocument, coalesceKey?: string) => void;
  onClose: () => void;
}

type Dir = "out" | "in" | "both" | "none";
const arrowOf = (e: ArchEdge, self: string) => (e.undirected ? "—" : e.bidirectional ? "↔" : e.from === self ? "→" : "←");

export function NodeEditPanel({ doc, nodeId, onEdit, onClose }: Props) {
  const node = doc.architecture.nodes.find((n) => n.id === nodeId);
  const [target, setTarget] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [dir, setDir] = useState<Dir>("out");
  if (!node) return null;

  const arch = doc.architecture;
  const lane = memberships(arch).get(nodeId)?.lane;
  const edges = arch.edges.filter((e) => e.from === nodeId || e.to === nodeId);
  const others = arch.nodes.filter((n) => n.id !== nodeId);
  const labelOf = (id: string) => arch.nodes.find((n) => n.id === id)?.label.split("\n")[0] ?? id;

  const setNode = (next: ArchNode, key?: string) =>
    onEdit({ ...doc, architecture: { ...arch, nodes: arch.nodes.map((n) => (n.id === nodeId ? next : n)) } }, key);
  const setEdges = (next: ArchEdge[]) =>
    onEdit({ ...doc, architecture: { ...arch, edges: [...arch.edges.filter((e) => e.from !== nodeId && e.to !== nodeId), ...next] } });
  const setArtifacts = (artifacts: Artifact[]) => onEdit({ ...doc, artifacts });

  const moveToLane = (laneId: string) => {
    // Another lane: drop the cell and let normalize place it there (the
    // `group` hint picks the lane's first free row).
    const { col: _c, row: _r, ...rest } = node;
    setNode(laneId ? { ...rest, group: laneId } : rest);
  };
  const addEdge = () => {
    if (!target) return;
    const label = edgeLabel.trim() || undefined;
    const e: ArchEdge =
      dir === "in"
        ? { from: target, to: nodeId, label }
        : { from: nodeId, to: target, label, ...(dir === "both" ? { bidirectional: true } : {}), ...(dir === "none" ? { undirected: true } : {}) };
    setEdges([...edges, e]);
    setTarget("");
    setEdgeLabel("");
  };
  const initial = (doc.artifacts ?? []).filter((a) => a.at === nodeId).map((a) => a.id);
  const deleteNode = () => {
    onEdit({
      ...doc,
      architecture: {
        ...arch,
        nodes: arch.nodes.filter((n) => n.id !== nodeId),
        edges: arch.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      },
    });
    onClose();
  };

  return (
    <aside className="panel task-edit-panel" aria-label="ノードの編集">
      <div className="panel-header">
        <div className="panel-title">ノードを編集</div>
        <div className="panel-header-actions">
          <button onClick={onClose} aria-label="編集欄を閉じる">閉じる</button>
        </div>
      </div>
      <div className="task-edit-body">
        <label className="te-field">
          <span>ラベル</span>
          <input value={node.label} onChange={(e) => setNode({ ...node, label: e.target.value }, `${nodeId}:label`)} />
        </label>
        <label className="te-field">
          <span>タイプ</span>
          <select value={node.type} onChange={(e) => setNode({ ...node, type: e.target.value as ArchNodeType })}>
            {NODE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="te-field">
          <span>レーン</span>
          <select value={lane && !lane.startsWith("__pad_") ? lane : ""} onChange={(e) => moveToLane(e.target.value)}>
            <option value="">(右端に新しい列)</option>
            {arch.columns.map((c, i) => (
              <option key={c.id} value={c.id}>
                {(c.label || `列${i + 1}`) + (c.tier === "bottom" ? "（下段）" : "")}
              </option>
            ))}
          </select>
        </label>
        <div className="te-field">
          <span>アイコン</span>
          <IconPicker value={node.icon ?? ""} onChange={(icon) => setNode({ ...node, icon: icon.trim() || undefined })} />
        </div>

        <InitialArtifacts
          doc={doc}
          nodeId={nodeId}
          selected={initial}
          extra={[]}
          onChange={(ids) =>
            setArtifacts(
              (doc.artifacts ?? []).map((a) => {
                if (ids.includes(a.id)) return a.at === nodeId ? a : { ...a, at: nodeId };
                if (a.at !== nodeId) return a;
                const { at: _at, ...rest } = a;
                return rest;
              }),
            )
          }
          onCreate={(a) => setArtifacts([...(doc.artifacts ?? []), { ...a, at: nodeId }])}
        />

        <div className="te-field">
          <span>接続</span>
          {edges.length === 0 && <span className="al-none">まだ接続がありません</span>}
          <ul className="ne-edges">
            {edges.map((e, i) => (
              <li key={`${e.from}-${e.to}-${i}`}>
                <span>
                  {arrowOf(e, nodeId)} {labelOf(e.from === nodeId ? e.to : e.from)}
                  {e.label ? `（${e.label}）` : ""}
                </span>
                <button className="te-delete" onClick={() => setEdges(edges.filter((_, j) => j !== i))} aria-label="この接続を消す">
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="te-new">
            <select value={dir} onChange={(e) => setDir(e.target.value as Dir)} aria-label="向き">
              <option value="out">→</option>
              <option value="in">←</option>
              <option value="both">↔</option>
              <option value="none">—</option>
            </select>
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="接続先">
              <option value="">接続先を選ぶ</option>
              {others.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label.split("\n")[0]}
                </option>
              ))}
            </select>
            <input value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} placeholder="ラベル（任意）" />
            <button onClick={addEdge} disabled={!target}>
              足す
            </button>
          </div>
        </div>

        <button className="al-delete" onClick={deleteNode} title="元に戻すで戻せます">
          このノードを消す
        </button>
      </div>
    </aside>
  );
}
