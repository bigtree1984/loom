import { useMemo, useState } from "react";
import type { ArchEdge, ArchNodeColorToken, ArchNodeType, LoomDocument } from "../types";
import { Modal } from "./Modal";

const NODE_TYPES: ArchNodeType[] = ["human", "frontend", "backend", "agent", "storage"];
const COLOR_TOKENS: ArchNodeColorToken[] = ["color_1", "color_2", "color_3", "color_4", "color_5"];

interface Props {
  doc: LoomDocument;
  /** null = adding a new node */
  nodeId: string | null;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

export function NodeEditorModal({ doc, nodeId, onSave, onClose }: Props) {
  const existing = useMemo(() => doc.architecture.nodes.find((n) => n.id === nodeId) ?? null, [doc, nodeId]);

  const [id, setId] = useState(existing?.id ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [type, setType] = useState<ArchNodeType>(existing?.type ?? "agent");
  const [group, setGroup] = useState(existing?.group ?? "");
  const [colorToken, setColorToken] = useState<ArchNodeColorToken | "">(existing?.colorToken ?? "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [edges, setEdges] = useState<ArchEdge[]>(
    doc.architecture.edges.filter((e) => e.a === nodeId || e.b === nodeId),
  );
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const otherNodes = doc.architecture.nodes.filter((n) => n.id !== nodeId);
  const groups = doc.architecture.groups ?? [];

  const addEdge = () => {
    if (!newEdgeTarget) return;
    const selfId = existing?.id ?? id.trim();
    setEdges((prev) => [...prev, { a: selfId, b: newEdgeTarget, label: newEdgeLabel.trim() || undefined }]);
    setNewEdgeTarget("");
    setNewEdgeLabel("");
  };

  const removeEdge = (index: number) => {
    setEdges((prev) => prev.filter((_, i) => i !== index));
  };

  const otherEndOf = (e: ArchEdge, selfId: string) => (e.a === selfId ? e.b : e.a);
  const labelOf = (id: string) => doc.architecture.nodes.find((n) => n.id === id)?.label ?? id;

  const handleSave = () => {
    const trimmedId = id.trim();
    if (!trimmedId) {
      setError("IDを入力してください");
      return;
    }
    if (!existing && doc.architecture.nodes.some((n) => n.id === trimmedId)) {
      setError("そのIDは既に使われています");
      return;
    }
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }

    const newNode = {
      id: trimmedId,
      label: label.trim(),
      type,
      group: group || undefined,
      colorToken: colorToken || undefined,
      icon: icon.trim() || undefined,
    };
    const otherEdges = doc.architecture.edges.filter((e) => e.a !== nodeId && e.b !== nodeId);

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
        edges: doc.architecture.edges.filter((e) => e.a !== nodeId && e.b !== nodeId),
      },
    });
  };

  return (
    <Modal title={existing ? "ノードを編集" : "ノードを追加"} onClose={onClose}>
      <label>
        ID
        <input value={id} onChange={(e) => setId(e.target.value)} disabled={!!existing} placeholder="例: cache_service" />
      </label>
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
        グループ
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">(なし)</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        ドット色
        <select value={colorToken} onChange={(e) => setColorToken(e.target.value as ArchNodeColorToken | "")}>
          <option value="">(タイプから自動)</option>
          {COLOR_TOKENS.map((c) => (
            <option key={c} value={c}>
              {c}
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
        const selfId = existing?.id ?? id.trim();
        const other = otherEndOf(e, selfId);
        return (
          <div className="modal-conn-row" key={`${e.a}-${e.b}-${i}`}>
            <span className="modal-conn-label">
              — {labelOf(other)}
              {e.label ? `(${e.label})` : ""}
            </span>
            <button onClick={() => removeEdge(i)}>削除</button>
          </div>
        );
      })}
      <div className="modal-add-conn">
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
