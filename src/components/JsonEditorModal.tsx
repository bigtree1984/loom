import { useState } from "react";
import type { LoomDocument } from "../types";
import { Modal } from "./Modal";

interface Props {
  doc: LoomDocument;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

export function JsonEditorModal({ doc, onSave, onClose }: Props) {
  const [text, setText] = useState(() => JSON.stringify(doc, null, 2));
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setError(e instanceof Error ? `JSONとして読み込めません: ${e.message}` : "JSONとして読み込めません");
      return;
    }
    const candidate = parsed as Partial<LoomDocument>;
    if (!candidate?.architecture?.nodes || !candidate?.flow?.tasks) {
      setError("architecture.nodes / flow.tasks が見つかりません");
      return;
    }
    setError(null);
    onSave(candidate as LoomDocument);
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "loom-document.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal title="JSONを表示/編集" onClose={onClose} size="large">
      <textarea
        className="json-editor-textarea"
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-footer">
        <div>
          <button onClick={handleDownload}>ダウンロード</button>
        </div>
        <div className="modal-footer-right">
          <button onClick={onClose}>キャンセル</button>
          <button className="control-choice forward" onClick={handleSave}>
            保存して読み込む
          </button>
        </div>
      </div>
    </Modal>
  );
}
