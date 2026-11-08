import { useMemo, useState } from "react";
import type { Artifact, LoomDocument } from "../types";
import { artifactJourney, deleteArtifact, fullMainRoute, type JourneyItem } from "../graph/artifactJourney";

/**
 * Artifact list (DESIGN_v3 §4 item 8): rename (fixing a wrong name — every
 * action follows, since actions refer to the id), signal / tool switches,
 * delete (stripped from actions, ⚠ left behind), where it is used, and its
 * journey along the main route as a tree.
 */

interface Props {
  doc: LoomDocument;
  onEdit: (doc: LoomDocument, coalesceKey?: string) => void;
  onClose: () => void;
  /** Opens a task in the side editor. */
  onOpenTask: (taskId: string) => void;
}

export function ArtifactListPanel({ doc, onEdit, onClose, onOpenTask }: Props) {
  const artifacts = doc.artifacts ?? [];
  const route = useMemo(() => fullMainRoute(doc), [doc]);
  const [open, setOpen] = useState<string | null>(null);

  const setArtifact = (id: string, patch: Partial<Artifact>, key?: string) =>
    onEdit(
      {
        ...doc,
        artifacts: artifacts.map((a) => {
          if (a.id !== id) return a;
          const next = { ...a, ...patch };
          if (!next.transient) delete next.transient;
          if (!next.tool) delete next.tool;
          return next;
        }),
      },
      key,
    );

  return (
    <aside className="panel task-edit-panel artifact-list-panel" aria-label="アーティファクトの一覧">
      <div className="panel-header">
        <div className="panel-title">アーティファクト（{artifacts.length}）</div>
        <div className="panel-header-actions">
          <button onClick={onClose} aria-label="一覧を閉じる">閉じる</button>
        </div>
      </div>
      <div className="task-edit-body">
        {artifacts.length === 0 && <p className="al-empty">まだありません。タスクの action で「作る」などの結果として作れます。</p>}
        <ul className="al-list">
          {artifacts.map((a) => (
            <ArtifactItem
              key={a.id}
              doc={doc}
              artifact={a}
              route={route}
              expanded={open === a.id}
              onToggle={() => setOpen(open === a.id ? null : a.id)}
              onPatch={(patch, key) => setArtifact(a.id, patch, key)}
              onDelete={() => {
                onEdit(deleteArtifact(doc, a.id));
                setOpen(null);
              }}
              onOpenTask={onOpenTask}
            />
          ))}
        </ul>
      </div>
    </aside>
  );
}

interface ItemProps {
  doc: LoomDocument;
  artifact: Artifact;
  route: string[][];
  expanded: boolean;
  onToggle: () => void;
  onPatch: (patch: Partial<Artifact>, key?: string) => void;
  onDelete: () => void;
  onOpenTask: (taskId: string) => void;
}

function ArtifactItem({ doc, artifact: a, route, expanded, onToggle, onPatch, onDelete, onOpenTask }: ItemProps) {
  const journey = useMemo(() => (expanded ? artifactJourney(doc, a.id, route) : null), [expanded, doc, a.id, route]);
  const taskLabel = (id: string) => doc.flow.tasks.find((t) => t.id === id)?.label ?? id;
  const kind = a.tool ? "ツール" : a.transient ? "合図" : null;
  return (
    <li className={`al-item${expanded ? " is-open" : ""}`}>
      <button className="al-head" onClick={onToggle} aria-expanded={expanded}>
        <span className="al-caret" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="al-name">{a.label}</span>
        {kind && <span className="al-kind">{kind}</span>}
      </button>
      {expanded && journey && (
        <div className="al-body">
          <label className="te-field">
            <span>名前（すべての action に反映されます）</span>
            <input value={a.label} onChange={(e) => onPatch({ label: e.target.value }, `artifact:${a.id}:label`)} />
          </label>
          <div className="al-switches">
            <label className="te-check">
              <input type="checkbox" checked={!!a.transient} onChange={(e) => onPatch({ transient: e.target.checked })} />
              合図（受け取られたら消える）
            </label>
            <label className="te-check">
              <input type="checkbox" checked={!!a.tool} onChange={(e) => onPatch({ tool: e.target.checked })} />
              ツール
            </label>
          </div>

          <div className="te-field">
            <span>使われているタスク</span>
            {journey.usedIn.length ? (
              <div className="al-tasks">
                {journey.usedIn.map((id) => (
                  <button key={id} className="al-task" onClick={() => onOpenTask(id)} title="このタスクを編集欄で開く">
                    {taskLabel(id)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="al-none">どのタスクでも使われていません</span>
            )}
          </div>

          <div className="te-field">
            <span>道のり（正規ルート）</span>
            {journey.start || journey.items.length ? (
              <ol className="al-journey">
                {journey.start && <li className="al-start">{journey.start}</li>}
                <JourneyItems items={journey.items} onOpenTask={onOpenTask} />
              </ol>
            ) : (
              <span className="al-none">正規ルートでは通りません</span>
            )}
          </div>

          <button className="al-delete" onClick={onDelete} title="使っている action からも外します（元に戻すで戻せます）">
            このアーティファクトを消す
          </button>
        </div>
      )}
    </li>
  );
}

function JourneyItems({ items, onOpenTask }: { items: JourneyItem[]; onOpenTask: (taskId: string) => void }) {
  return (
    <>
      {items.map((it, i) =>
        "event" in it ? (
          <li key={i} className="al-event">
            <button className="al-event-task" onClick={() => onOpenTask(it.event.taskId)} title="このタスクを編集欄で開く">
              {it.event.taskLabel}
            </button>
            <span className="al-event-node">（{it.event.nodeLabel}）</span>
            <span className="al-event-text">{it.event.text}</span>
          </li>
        ) : (
          <li key={i} className="al-fork">
            <span className="al-fork-label">並行して進む</span>
            {it.fork.map((branch, j) => (
              <ol key={j} className="al-branch">
                <JourneyItems items={branch} onOpenTask={onOpenTask} />
              </ol>
            ))}
          </li>
        ),
      )}
    </>
  );
}
