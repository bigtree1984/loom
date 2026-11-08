import { useMemo, useRef, useState } from "react";
import type { ActionType, Artifact, LoomDocument, Task, TaskAction } from "../types";
import { nextId } from "../graph/ids";
import { describeAction } from "../graph/describeAction";
import {
  actionIssues,
  NEEDS_ARTIFACTS,
  NEEDS_RESULTS,
  placesBeforeAction,
  usableResult,
  usableTarget,
} from "../graph/actionCheck";

/**
 * Side editor for one task (DESIGN_v3 §4 item 8): the axis node and the
 * action list, edited live — every change goes straight into the document
 * (and the playback), undone with the header's 元に戻す.
 */

export const ACTION_TYPES: { type: ActionType; label: string; hint: string }[] = [
  { type: "create", label: "作る", hint: "何もないところから生み出す" },
  { type: "receive", label: "受け取る", hint: "ほかのノードから受け取る" },
  { type: "send", label: "渡す", hint: "ほかのノードへ渡す" },
  { type: "transform", label: "形を変える", hint: "もとは役目を終え、新しいものになる" },
  { type: "derive", label: "もとにして作る", hint: "もとは残り、新しいものができる" },
  { type: "inspect", label: "確かめる", hint: "見るだけ。変えない・動かさない" },
  { type: "discard", label: "捨てる", hint: "役目を終えさせる" },
];

interface Props {
  doc: LoomDocument;
  taskId: string;
  /** Live edit; same coalesceKey in a row = one undo step (typing). */
  onEdit: (doc: LoomDocument, coalesceKey?: string) => void;
  onClose: () => void;
  /** Opens the full dialog (connections between tasks). */
  onOpenDetails: () => void;
}

export function TaskEditPanel({ doc, taskId, onEdit, onClose, onOpenDetails }: Props) {
  const task = doc.flow.tasks.find((t) => t.id === taskId);
  const [adding, setAdding] = useState(false);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  if (!task) return null;
  const actions = task.actions ?? [];

  const setTask = (patch: Partial<Task>, key?: string, artifacts?: Artifact[]) =>
    onEdit(
      {
        ...doc,
        ...(artifacts ? { artifacts } : {}),
        flow: { ...doc.flow, tasks: doc.flow.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) },
      },
      key,
    );
  const setActions = (next: TaskAction[], key?: string, artifacts?: Artifact[]) => setTask({ actions: next }, key, artifacts);
  // Editing an action clears its "removed artifact" ⚠.
  const setAction = (i: number, a: TaskAction, key?: string, artifacts?: Artifact[]) => {
    const { removedArtifacts: _r, ...clean } = a;
    setActions(actions.map((x, j) => (j === i ? clean : x)), key, artifacts);
  };

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...actions];
    const [a] = next.splice(from, 1);
    next.splice(to, 0, a);
    setActions(next);
  };

  return (
    <aside className="panel task-edit-panel" aria-label="タスクの編集">
      <div className="panel-header">
        <div className="panel-title">タスクを編集</div>
        <div className="panel-header-actions">
          <button onClick={onOpenDetails} title="前後のタスクとのつながりなど">つながり…</button>
          <button onClick={onClose} aria-label="編集欄を閉じる">閉じる</button>
        </div>
      </div>
      <div className="task-edit-body">
        <label className="te-field">
          <span>ラベル</span>
          <input value={task.label} onChange={(e) => setTask({ label: e.target.value }, `${taskId}:label`)} />
        </label>
        <label className="te-field">
          <span>説明</span>
          <textarea rows={2} value={task.description ?? ""} onChange={(e) => setTask({ description: e.target.value }, `${taskId}:desc`)} />
        </label>
        <label className="te-field">
          <span>軸のノード</span>
          <select value={task.mainNode} onChange={(e) => setTask({ mainNode: e.target.value })}>
            {doc.architecture.nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label.split("\n")[0]}
              </option>
            ))}
          </select>
        </label>

        <div className="te-actions-head">アクション</div>
        <ol className="te-actions">
          {actions.map((a, i) => (
            <ActionRow
              key={i}
              doc={doc}
              task={task}
              index={i}
              action={a}
              onChange={(next, key, arts) => setAction(i, next, key, arts)}
              onDelete={() => setActions(actions.filter((_, j) => j !== i))}
              dragState={drag}
              onDragStart={() => setDrag({ from: i, over: i })}
              onDragOver={() => setDrag((d) => (d && d.over !== i ? { ...d, over: i } : d))}
              onDrop={() => {
                if (drag) move(drag.from, i);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            />
          ))}
        </ol>
        {adding ? (
          <div className="te-add-types" role="group" aria-label="アクションの類型を選ぶ">
            {ACTION_TYPES.map((t) => (
              <button
                key={t.type}
                title={t.hint}
                onClick={() => {
                  setActions([...actions, { type: t.type }]);
                  setAdding(false);
                }}
              >
                {t.label}
              </button>
            ))}
            <button className="te-cancel" onClick={() => setAdding(false)}>
              やめる
            </button>
          </div>
        ) : (
          <button className="te-add" onClick={() => setAdding(true)}>
            ＋ アクションを足す
          </button>
        )}
      </div>
    </aside>
  );
}

interface RowProps {
  doc: LoomDocument;
  task: Task;
  index: number;
  action: TaskAction;
  onChange: (a: TaskAction, key?: string, artifacts?: Artifact[]) => void;
  onDelete: () => void;
  dragState: { from: number; over: number } | null;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

function ActionRow({ doc, task, index, action: a, onChange, onDelete, dragState, onDragStart, onDragOver, onDrop, onDragEnd }: RowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const places = useMemo(() => placesBeforeAction(doc, task.id, index), [doc, task.id, index]);
  const issues = useMemo(() => actionIssues(doc, task.id, index, places), [doc, task.id, index, places]);
  const artifacts = doc.artifacts ?? [];
  const nodes = doc.architecture.nodes;
  const others = nodes.filter((n) => n.id !== task.mainNode);

  const changeType = (type: ActionType) => {
    const next: TaskAction = { type, ...(a.label ? { label: a.label } : {}) };
    if (NEEDS_ARTIFACTS.has(type) && a.artifacts?.length) next.artifacts = a.artifacts;
    if (NEEDS_RESULTS.has(type) && a.results?.length) next.results = a.results;
    if (type === "receive" && a.from) next.from = a.from;
    if (type === "send" && a.to) next.to = a.to;
    if ((type === "send" || type === "receive") && a.keep) next.keep = true;
    onChange(next);
  };

  const dragging = dragState?.from === index;
  const over = dragState && dragState.over === index && dragState.from !== index;
  return (
    <li
      ref={rowRef}
      className={["te-action", dragging && "is-dragging", over && (dragState!.from < index ? "drop-after" : "drop-before"), issues.length && "has-issues"]
        .filter(Boolean)
        .join(" ")}
      onDragOver={(e) => {
        if (!dragState) return;
        e.preventDefault();
        onDragOver();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <div className="te-action-head">
        <span
          className="te-handle"
          draggable
          title="ドラッグで並べ替え"
          aria-label="ドラッグで並べ替え"
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(index));
            if (rowRef.current) e.dataTransfer.setDragImage(rowRef.current, 16, 16);
            onDragStart();
          }}
          onDragEnd={onDragEnd}
        >
          ⠿
        </span>
        <span className="te-num">{index + 1}</span>
        <select className="te-type" value={a.type} onChange={(e) => changeType(e.target.value as ActionType)} aria-label="類型">
          {ACTION_TYPES.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
            </option>
          ))}
        </select>
        {issues.length > 0 && (
          <span className="te-warn" title={issues.map((x) => x.text).join("\n")}>
            ⚠
          </span>
        )}
        <button className="te-delete" onClick={onDelete} aria-label="このアクションを消す" title="消す（元に戻すで戻せます）">
          ×
        </button>
      </div>

      {a.type === "receive" && (
        <NodeSelect label="受け取り元" value={a.from} nodes={others} onChange={(from) => onChange({ ...a, from })} />
      )}
      {NEEDS_ARTIFACTS.has(a.type) && (
        <ArtifactPicker
          label={a.type === "transform" || a.type === "derive" ? "もと" : "対象"}
          selected={a.artifacts ?? []}
          artifacts={artifacts}
          usable={(id) => usableTarget(places, a, task.mainNode, id)}
          onChange={(ids) => onChange({ ...a, artifacts: ids })}
        />
      )}
      {NEEDS_RESULTS.has(a.type) && (
        <ArtifactPicker
          label="結果"
          selected={a.results ?? []}
          artifacts={artifacts}
          usable={(id) => usableResult(places, id)}
          onChange={(ids) => onChange({ ...a, results: ids })}
          onCreate={(art) => onChange({ ...a, results: [...(a.results ?? []), art.id] }, undefined, [...artifacts, art])}
          existingIds={artifacts.map((x) => x.id)}
        />
      )}
      {a.type === "send" && <NodeSelect label="渡し先" value={a.to} nodes={others} onChange={(to) => onChange({ ...a, to })} />}
      {(a.type === "send" || a.type === "receive") && (
        <label className="te-check">
          <input type="checkbox" checked={!!a.keep} onChange={(e) => onChange({ ...a, keep: e.target.checked || undefined })} />
          写しを{a.type === "send" ? "渡す" : "受け取る"}（もとは残す）
        </label>
      )}
      <label className="te-field te-caption">
        <span>説明文</span>
        <input
          value={a.label ?? ""}
          placeholder={describeAction({ ...a, label: undefined }, doc)}
          onChange={(e) => onChange({ ...a, label: e.target.value || undefined }, `${task.id}:${index}:label`)}
        />
      </label>
      {issues.length > 0 && (
        <ul className="te-issues">
          {issues.map((x, i) => (
            <li key={i}>⚠ {x.text}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function NodeSelect({ label, value, nodes, onChange }: { label: string; value?: string; nodes: { id: string; label: string }[]; onChange: (id: string) => void }) {
  return (
    <label className="te-field">
      <span>{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>
          選ぶ…
        </option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label.split("\n")[0]}
          </option>
        ))}
      </select>
    </label>
  );
}

interface PickerProps {
  label: string;
  selected: string[];
  artifacts: Artifact[];
  usable: (id: string) => boolean;
  onChange: (ids: string[]) => void;
  onCreate?: (a: Artifact) => void;
  existingIds?: string[];
}

/** Selected artifacts as chips, plus a list to add more: usable ones first
 * in plain text, the rest greyed with ⚠ (still selectable). */
function ArtifactPicker({ label, selected, artifacts, usable, onChange, onCreate, existingIds = [] }: PickerProps) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [transient, setTransient] = useState(false);
  const [tool, setTool] = useState(false);
  const labelOf = (id: string) => artifacts.find((x) => x.id === id)?.label ?? id;
  const rest = artifacts.filter((x) => !selected.includes(x.id));
  const ok = rest.filter((x) => usable(x.id));
  const ng = rest.filter((x) => !usable(x.id));
  const create = () => {
    const l = name.trim();
    if (!l || !onCreate) return;
    onCreate({ id: nextId("artifact", existingIds), label: l, ...(transient ? { transient: true } : {}), ...(tool ? { tool: true } : {}) });
    setName("");
    setTransient(false);
    setTool(false);
    setCreating(false);
  };
  return (
    <div className="te-field">
      <span>{label}</span>
      <div className="te-chips">
        {selected.map((id) => (
          <span key={id} className={`te-chip${usable(id) ? "" : " is-ng"}`}>
            {!usable(id) && "⚠ "}
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
          aria-label={`${label}を足す`}
        >
          <option value="">＋ 足す…</option>
          {ok.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
          {ng.length > 0 && (
            <optgroup label="この時点では合わない">
              {ng.map((x) => (
                <option key={x.id} value={x.id} className="te-option-ng">
                  ⚠ {x.label}
                </option>
              ))}
            </optgroup>
          )}
          {onCreate && <option value="__new">＋ 新しく作る…</option>}
        </select>
      </div>
      {creating && (
        <div className="te-new">
          <input
            autoFocus
            value={name}
            placeholder="名前（例：人物タグ）"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
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
          <button className="te-cancel" onClick={() => setCreating(false)}>
            やめる
          </button>
        </div>
      )}
    </div>
  );
}
