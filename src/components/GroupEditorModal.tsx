import { useState } from "react";
import type { LoomDocument } from "../types";
import { Modal } from "./Modal";

interface Props {
  doc: LoomDocument;
  /** null = adding a new group */
  groupId: string | null;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

export function GroupEditorModal({ doc, groupId, onSave, onClose }: Props) {
  const groups = doc.architecture.groups ?? [];
  const existing = groups.find((g) => g.id === groupId) ?? null;

  const [id, setId] = useState(existing?.id ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [error, setError] = useState<string | null>(null);

  const nodeCount = doc.architecture.nodes.filter((n) => n.group === groupId).length;

  const handleSave = () => {
    const trimmedId = id.trim();
    if (!trimmedId) {
      setError("IDを入力してください");
      return;
    }
    if (!existing && groups.some((g) => g.id === trimmedId)) {
      setError("そのIDは既に使われています");
      return;
    }
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }
    const newGroup = { id: trimmedId, label: label.trim() };
    onSave({
      ...doc,
      architecture: {
        ...doc.architecture,
        groups: existing ? groups.map((g) => (g.id === groupId ? newGroup : g)) : [...groups, newGroup],
      },
    });
  };

  const handleDelete = () => {
    if (!existing) return;
    onSave({
      ...doc,
      architecture: {
        ...doc.architecture,
        groups: groups.filter((g) => g.id !== groupId),
        // Nodes that lived in this lane fall back to a type-keyed lane
        // instead of pointing at a group that no longer exists.
        nodes: doc.architecture.nodes.map((n) => (n.group === groupId ? { ...n, group: undefined } : n)),
      },
    });
  };

  return (
    <Modal title={existing ? "レーンを編集" : "レーンを追加"} onClose={onClose}>
      <label>
        ID
        <input value={id} onChange={(e) => setId(e.target.value)} disabled={!!existing} placeholder="例: cache_layer" />
      </label>
      <label>
        ラベル
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: キャッシュ層" />
      </label>

      {existing && (
        <p className="modal-section-title">
          {nodeCount === 0 ? "このレーンにはまだノードがありません" : `このレーンには${nodeCount}件のノードがあります`}
        </p>
      )}

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-footer">
        <div>{existing && <button onClick={handleDelete}>このレーンを削除</button>}</div>
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
