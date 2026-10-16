import { useMemo, useState } from "react";
import type { ArchEdge, ArchNodeType, LoomDocument } from "../types";
import { nextId } from "../graph/ids";
import { Modal } from "./Modal";

const NODE_TYPES: ArchNodeType[] = ["human", "frontend", "backend", "agent", "storage"];

interface Props {
  doc: LoomDocument;
  /** null = adding a new node */
  nodeId: string | null;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

export function NodeEditorModal({ doc, nodeId, onSave, onClose }: Props) {
  const existing = useMemo(() => doc.architecture.nodes.find((n) => n.id === nodeId) ?? null, [doc, nodeId]);

  const [id] = useState(() => existing?.id ?? nextId("node", doc.architecture.nodes.map((x) => x.id)));
  const [label, setLabel] = useState(existing?.label ?? "");
  const [type, setType] = useState<ArchNodeType>(existing?.type ?? "agent");
  // Column index as a string ("" = a new column at the right edge).
  const [col, setCol] = useState(existing?.col !== undefined ? String(existing.col) : "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [edges, setEdges] = useState<ArchEdge[]>(
    doc.architecture.edges.filter((e) => e.from === nodeId || e.to === nodeId),
  );
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("");
  const [newEdgeDir, setNewEdgeDir] = useState<"out" | "in" | "both" | "none">("out");
  const [error, setError] = useState<string | null>(null);

  const otherNodes = doc.architecture.nodes.filter((n) => n.id !== nodeId);
  const columns = doc.architecture.columns;

  const addEdge = () => {
    if (!newEdgeTarget) return;
    const selfId = id;
    const label = newEdgeLabel.trim() || undefined;
    const edge: ArchEdge =
      newEdgeDir === "in"
        ? { from: newEdgeTarget, to: selfId, label }
        : { from: selfId, to: newEdgeTarget, label, ...(newEdgeDir === "both" ? { bidirectional: true } : {}),
            ...(newEdgeDir === "none" ? { undirected: true } : {}) };
    setEdges((prev) => [...prev, edge]);
    setNewEdgeTarget("");
    setNewEdgeLabel("");
  };

  const removeEdge = (index: number) => {
    setEdges((prev) => prev.filter((_, i) => i !== index));
  };

  const otherEndOf = (e: ArchEdge, selfId: string) => (e.from === selfId ? e.to : e.from);
  const arrowOf = (e: ArchEdge, selfId: string) => (e.undirected ? "—" : e.bidirectional ? "↔" : e.from === selfId ? "→" : "←");
  const labelOf = (id: string) => doc.architecture.nodes.find((n) => n.id === id)?.label ?? id;

  const handleSave = () => {
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }

    const newNode = {
      id: id,
      label: label.trim(),
      type,
      // Same column keeps its cell; a new column lets normalize pick the
      // first free row there.
      ...(col === "" ? {} : { col: Number(col) }),
      ...(existing && existing.col === Number(col) && col !== "" ? { row: existing.row } : {}),
      icon: icon.trim() || undefined,
    };
    const otherEdges = doc.architecture.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);

    onSave({
      ...doc,
      architecture: {
        ...doc.architecture,
        nodes: existing
          ? doc.architecture.nodes.map((n) => (n.id === nodeId ? newNode : n))
          : [...doc.architecture.nodes, newNode],
        edges: [...otherEdges, ...edges],
      },
    });
  };

  const handleDelete = () => {
    if (!existing) return;
    onSave({
      ...doc,
      architecture: {
        ...doc.architecture,
        nodes: doc.architecture.nodes.filter((n) => n.id !== nodeId),
        edges: doc.architecture.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      },
    });
  };

  return (
    <Modal title={existing ? "ノードを編集" : "ノードを追加"} onClose={onClose}>
      {existing && <div style={{ fontSize: 11, opacity: 0.6 }}>ID: {id}</div>}
      <label>
        ラベル
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: キャッシュサービス" />
      </label>
      <label>
        タイプ
        <select value={type} onChange={(e) => setType(e.target.value as ArchNodeType)}>
          {NODE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        列
        <select value={col} onChange={(e) => setCol(e.target.value)}>
          <option value="">(右端に新しい列)</option>
          {columns.map((c, i) => (
            <option key={c.id} value={String(i)}>
              {c.label || `列${i + 1}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        アイコン
        <input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="例: aws-s3(任意)" />
      </label>

      <p className="modal-section-title">接続</p>
      {edges.length === 0 && <p className="modal-conn-row">まだ接続がありません</p>}
      {edges.map((e, i) => {
        const selfId = id;
        const other = otherEndOf(e, selfId);
        return (
          <div className="modal-conn-row" key={`${e.from}-${e.to}-${i}`}>
            <span className="modal-conn-label">
              {arrowOf(e, selfId)} {labelOf(other)}
              {e.label ? `(${e.label})` : ""}
            </span>
            <button onClick={() => removeEdge(i)}>削除</button>
          </div>
        );
      })}
      <div className="modal-add-conn">
        <select value={newEdgeDir} onChange={(e) => setNewEdgeDir(e.target.value as "out" | "in" | "both" | "none")} aria-label="向き">
          <option value="out">→</option>
          <option value="in">←</option>
          <option value="both">↔</option>
          <option value="none">— (向きなし)</option>
        </select>
        <select value={newEdgeTarget} onChange={(e) => setNewEdgeTarget(e.target.value)}>
          <option value="">接続先を選択</option>
          {otherNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
        <input
          value={newEdgeLabel}
          onChange={(e) => setNewEdgeLabel(e.target.value)}
          placeholder="ラベル(任意)"
        />
        <button onClick={addEdge} disabled={!newEdgeTarget}>
          追加
        </button>
      </div>

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-footer">
        <div>{existing && <button onClick={handleDelete}>このノードを削除</button>}</div>
        <div className="modal-footer-right">
          <button onClick={onClose}>キャンセル</button>
          <button className="control-choice forward" onClick={handleSave}>
            保存
          </button>
        </div>
      </div>
    </Modal>
  );
}
