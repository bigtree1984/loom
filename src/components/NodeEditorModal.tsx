import { useMemo, useState } from "react";
import type { ArchEdge, ArchNodeType, Artifact, LoomDocument } from "../types";
import { nextId } from "../graph/ids";
import { memberships } from "../graph/lanes";
import { Modal } from "./Modal";
import { IconPicker } from "./IconPicker";

export const NODE_TYPES: ArchNodeType[] = ["human", "frontend", "backend", "agent", "storage"];

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
  // Lane id ("" = a new lane at the right edge). DESIGN_v2 §13: a lane is
  // no longer simply a column index.
  const laneOfExisting = useMemo(() => (existing ? memberships(doc.architecture).get(existing.id)?.lane : undefined), [doc, existing]);
  const [col, setCol] = useState(laneOfExisting && !laneOfExisting.startsWith("__pad_") ? laneOfExisting : "");
  const [icon, setIcon] = useState(existing?.icon ?? "");
  const [edges, setEdges] = useState<ArchEdge[]>(
    doc.architecture.edges.filter((e) => e.from === nodeId || e.to === nodeId),
  );
  const [newEdgeTarget, setNewEdgeTarget] = useState("");
  const [newEdgeLabel, setNewEdgeLabel] = useState("");
  const [newEdgeDir, setNewEdgeDir] = useState<"out" | "in" | "both" | "none">("out");
  const [error, setError] = useState<string | null>(null);
  // v3: artifacts that sit on this node from the start (`at`).
  const [initial, setInitial] = useState<string[]>(() => (doc.artifacts ?? []).filter((x) => nodeId && x.at === nodeId).map((x) => x.id));
  const [newArtifacts, setNewArtifacts] = useState<Artifact[]>([]);


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
      // Same lane keeps its cell; another lane lets normalize pick the
      // first free row there (the `group` hint).
      ...(existing && col !== "" && col === laneOfExisting
        ? { col: existing.col, row: existing.row }
        : col !== ""
          ? { group: col }
          : {}),
      icon: icon.trim() || undefined,
    };
    const otherEdges = doc.architecture.edges.filter((e) => e.from !== nodeId && e.to !== nodeId);
    const artifacts = [...(doc.artifacts ?? []), ...newArtifacts].map((x) => {
      if (initial.includes(x.id)) return x.at === id ? x : { ...x, at: id };
      if (x.at === id || (nodeId && x.at === nodeId)) {
        const { at: _at, ...rest } = x;
        return rest;
      }
      return x;
    });

    onSave({
      ...doc,
      ...(artifacts.length ? { artifacts } : {}),
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
            <option key={c.id} value={c.id}>
              {(c.label || `列${i + 1}`) + (c.tier === "bottom" ? "（下段）" : "")}
            </option>
          ))}
        </select>
      </label>
      <div className="modal-field">
        アイコン
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <InitialArtifacts
        doc={doc}
        nodeId={id}
        selected={initial}
        extra={newArtifacts}
        onChange={setInitial}
        onCreate={(x) => {
          setNewArtifacts((list) => [...list, x]);
          setInitial((ids) => [...ids, x.id]);
        }}
      />

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

/** 「最初からあるもの」(DESIGN_v3 §4 item 8): artifacts on this node at the
 * start. Ones some task creates are listed greyed with ⚠ (still choosable —
 * the checker then flags that task's action). */
export function InitialArtifacts({
  doc,
  nodeId,
  selected,
  extra,
  onChange,
  onCreate,
}: {
  doc: LoomDocument;
  nodeId: string;
  selected: string[];
  extra: Artifact[];
  onChange: (ids: string[]) => void;
  onCreate: (a: Artifact) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [transient, setTransient] = useState(false);
  const [tool, setTool] = useState(false);
  const all = [...(doc.artifacts ?? []), ...extra];
  const labelOf = (id: string) => all.find((x) => x.id === id)?.label ?? id;
  const nodeLabel = (id?: string) => doc.architecture.nodes.find((n) => n.id === id)?.label.split("\n")[0] ?? id;
  const born = new Set(doc.flow.tasks.flatMap((t) => (t.actions ?? []).flatMap((a) => a.results ?? [])));
  const rest = all.filter((x) => !selected.includes(x.id));
  const ok = rest.filter((x) => !born.has(x.id));
  const ng = rest.filter((x) => born.has(x.id));
  const where = (x: Artifact) => (x.at && x.at !== nodeId ? `（今は${nodeLabel(x.at)}に置いています）` : "");
  const create = () => {
    const l = name.trim();
    if (!l) return;
    onCreate({ id: nextId("artifact", all.map((x) => x.id)), label: l, ...(transient ? { transient: true } : {}), ...(tool ? { tool: true } : {}) });
    setName("");
    setTransient(false);
    setTool(false);
    setCreating(false);
  };
  return (
    <div className="modal-field">
      <p className="modal-section-title">最初からあるもの</p>
      <div className="te-chips">
        {selected.length === 0 && <span className="al-none">ありません</span>}
        {selected.map((id) => (
          <span key={id} className={`te-chip${born.has(id) ? " is-ng" : ""}`} title={born.has(id) ? "タスクの action でも生まれるものです" : undefined}>
            {born.has(id) && "⚠ "}
            {labelOf(id)}
            <button onClick={() => onChange(selected.filter((x) => x !== id))} aria-label={`${labelOf(id)} を外す`}>
              ×
            </button>
          </span>
        ))}
        <select
          className="te-chip-add"
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__new") setCreating(true);
            else if (v) onChange([...selected, v]);
          }}
          aria-label="最初からあるものを足す"
        >
          <option value="">＋ 足す…</option>
          {ok.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
              {where(x)}
            </option>
          ))}
          {ng.length > 0 && (
            <optgroup label="タスクで生まれるもの">
              {ng.map((x) => (
                <option key={x.id} value={x.id}>
                  ⚠ {x.label}
                </option>
              ))}
            </optgroup>
          )}
          <option value="__new">＋ 新しく作る…</option>
        </select>
      </div>
      {creating && (
        <div className="te-new">
          <input autoFocus value={name} placeholder="名前（例：音声1,013本）" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} />
          <label className="te-check">
            <input type="checkbox" checked={transient} onChange={(e) => setTransient(e.target.checked)} />
            合図
          </label>
          <label className="te-check">
            <input type="checkbox" checked={tool} onChange={(e) => setTool(e.target.checked)} />
            ツール
          </label>
          <button onClick={create} disabled={!name.trim()}>
            作る
          </button>
          <button onClick={() => setCreating(false)}>やめる</button>
        </div>
      )}
    </div>
  );
}
