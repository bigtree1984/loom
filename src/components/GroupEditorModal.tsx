import { useState } from "react";
import type { LoomDocument } from "../types";
import { nextId } from "../graph/ids";
import { addColumn, nodesInColumn, removeColumn, renameColumn } from "../graph/gridEdits";
import { Modal } from "./Modal";

interface Props {
  doc: LoomDocument;
  /** null = adding a new column */
  groupId: string | null;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

/** Edits a column header (v1 called these lanes / groups). */
export function GroupEditorModal({ doc, groupId, onSave, onClose }: Props) {
  const columns = doc.architecture.columns;
  const existing = columns.find((c) => c.id === groupId) ?? null;

  const [id] = useState(() => existing?.id ?? nextId("lane", columns.map((c) => c.id)));
  const [label, setLabel] = useState(existing?.label ?? "");
  const [error, setError] = useState<string | null>(null);

  const nodeCount = existing ? nodesInColumn(doc, existing.id) : 0;

  const handleSave = () => {
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }
    onSave(existing ? renameColumn(doc, id, label.trim()) : addColumn(doc, { id, label: label.trim() }));
  };

  const handleDelete = () => {
    if (!existing) return;
    const next = removeColumn(doc, existing.id);
    if (!next) {
      setError("ノードが残っている列は削除できません。先にノードを別の列へ移動してください");
      return;
    }
    onSave(next);
  };

  return (
    <Modal title={existing ? "列を編集" : "列を追加"} onClose={onClose}>
      {existing && <div style={{ fontSize: 11, opacity: 0.6 }}>ID: {id}</div>}
      <label>
        ラベル
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: キャッシュ層" />
      </label>

      {existing && (
        <p className="modal-section-title">
          {nodeCount === 0 ? "この列にはまだノードがありません" : `この列には${nodeCount}件のノードがあります`}
        </p>
      )}

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-footer">
        <div>{existing && <button onClick={handleDelete}>この列を削除</button>}</div>
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
