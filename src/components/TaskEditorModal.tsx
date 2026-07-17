import { useMemo, useState } from "react";
import type { Connection, LoomDocument } from "../types";
import { Modal } from "./Modal";

interface Props {
  doc: LoomDocument;
  /** null = adding a new task */
  taskId: string | null;
  onSave: (doc: LoomDocument) => void;
  onClose: () => void;
}

type Direction = "incoming" | "outgoing";

export function TaskEditorModal({ doc, taskId, onSave, onClose }: Props) {
  const existing = useMemo(() => doc.flow.tasks.find((t) => t.id === taskId) ?? null, [doc, taskId]);

  const [id, setId] = useState(existing?.id ?? "");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [mainNode, setMainNode] = useState(existing?.mainNode ?? doc.architecture.nodes[0]?.id ?? "");
  const [inputNodes, setInputNodes] = useState<string[]>(existing?.inputNodes ?? []);
  const [outputNodes, setOutputNodes] = useState<string[]>(existing?.outputNodes ?? []);
  const [connections, setConnections] = useState<Connection[]>(
    doc.flow.connections.filter((c) => c.from === taskId || c.to === taskId),
  );
  const [newConnDirection, setNewConnDirection] = useState<Direction>("outgoing");
  const [newConnTarget, setNewConnTarget] = useState("");
  const [newConnLabel, setNewConnLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const otherTasks = doc.flow.tasks.filter((t) => t.id !== taskId);
  const taskLabelOf = (id: string) => doc.flow.tasks.find((t) => t.id === id)?.label ?? id;

  const toggleInNodeSet = (setter: (v: string[]) => void, current: string[], nodeId: string) => {
    setter(current.includes(nodeId) ? current.filter((n) => n !== nodeId) : [...current, nodeId]);
  };

  const addConnection = () => {
    if (!newConnTarget) return;
    const selfId = existing?.id ?? id.trim();
    const conn: Connection =
      newConnDirection === "outgoing"
        ? { from: selfId, to: newConnTarget, label: newConnLabel.trim() || undefined }
        : { from: newConnTarget, to: selfId, label: newConnLabel.trim() || undefined };
    setConnections((prev) => [...prev, conn]);
    setNewConnTarget("");
    setNewConnLabel("");
  };

  const removeConnection = (index: number) => {
    setConnections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    const trimmedId = id.trim();
    if (!trimmedId) {
      setError("IDを入力してください");
      return;
    }
    if (!existing && doc.flow.tasks.some((t) => t.id === trimmedId)) {
      setError("そのIDは既に使われています");
      return;
    }
    if (!label.trim()) {
      setError("ラベルを入力してください");
      return;
    }
    if (!mainNode) {
      setError("軸ノードを選択してください");
      return;
    }

    const newTask = {
      id: trimmedId,
      label: label.trim(),
      description: description.trim(),
      mainNode,
      inputNodes,
      outputNodes,
    };
    const otherConnections = doc.flow.connections.filter((c) => c.from !== taskId && c.to !== taskId);

    onSave({
      ...doc,
      flow: {
        ...doc.flow,
        tasks: existing
          ? doc.flow.tasks.map((t) => (t.id === taskId ? newTask : t))
          : [...doc.flow.tasks, newTask],
        connections: [...otherConnections, ...connections],
      },
    });
  };

  const handleDelete = () => {
    if (!existing) return;
    onSave({
      ...doc,
      flow: {
        ...doc.flow,
        tasks: doc.flow.tasks.filter((t) => t.id !== taskId),
        connections: doc.flow.connections.filter((c) => c.from !== taskId && c.to !== taskId),
      },
    });
  };

  return (
    <Modal title={existing ? "タスクを編集" : "タスクを追加"} onClose={onClose}>
      <label>
        ID
        <input value={id} onChange={(e) => setId(e.target.value)} disabled={!!existing} placeholder="例: t10" />
      </label>
      <label>
        ラベル
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 通知送信" />
      </label>
      <label>
        説明
        <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <label>
        軸ノード(mainNode)
        <select value={mainNode} onChange={(e) => setMainNode(e.target.value)}>
          {doc.architecture.nodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        入力ノード
        <span className="modal-checkbox-list">
          {doc.architecture.nodes.map((n) => (
            <label key={n.id}>
              <input
                type="checkbox"
                checked={inputNodes.includes(n.id)}
                onChange={() => toggleInNodeSet(setInputNodes, inputNodes, n.id)}
              />
              {n.label}
            </label>
          ))}
        </span>
      </label>
      <label>
        出力ノード
        <span className="modal-checkbox-list">
          {doc.architecture.nodes.map((n) => (
            <label key={n.id}>
              <input
                type="checkbox"
                checked={outputNodes.includes(n.id)}
                onChange={() => toggleInNodeSet(setOutputNodes, outputNodes, n.id)}
              />
              {n.label}
            </label>
          ))}
        </span>
      </label>

      <p className="modal-section-title">前後のタスク接続</p>
      {connections.length === 0 && <p className="modal-conn-row">まだ接続がありません</p>}
      {connections.map((c, i) => {
        const selfId = existing?.id ?? id.trim();
        const isOutgoing = c.from === selfId;
        const other = isOutgoing ? c.to : c.from;
        return (
          <div className="modal-conn-row" key={`${c.from}-${c.to}-${i}`}>
            <span className="modal-conn-label">
              {isOutgoing ? "→ " : "← "}
              {taskLabelOf(other)}
              {c.label ? `(${c.label})` : ""}
            </span>
            <button onClick={() => removeConnection(i)}>削除</button>
          </div>
        );
      })}
      <div className="modal-add-conn">
        <select value={newConnDirection} onChange={(e) => setNewConnDirection(e.target.value as Direction)}>
          <option value="outgoing">次へ →</option>
          <option value="incoming">← 前から</option>
        </select>
        <select value={newConnTarget} onChange={(e) => setNewConnTarget(e.target.value)}>
          <option value="">タスクを選択</option>
          {otherTasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          value={newConnLabel}
          onChange={(e) => setNewConnLabel(e.target.value)}
          placeholder="ラベル(任意)"
        />
        <button onClick={addConnection} disabled={!newConnTarget}>
          追加
        </button>
      </div>

      {error && <p className="modal-error">{error}</p>}

      <div className="modal-footer">
        <div>{existing && <button onClick={handleDelete}>このタスクを削除</button>}</div>
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
