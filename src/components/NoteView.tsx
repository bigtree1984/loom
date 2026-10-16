import { useMemo, useRef, useState } from "react";
import { noteCells } from "../graph/noteCells";
import { currentFigureInput } from "../export/noteExport";
import { noteCellAt, noteCellCenter } from "../export/noteLayout";
import { renderNoteFigure, type NoteHighlight } from "../export/renderNoteSvg";
import type { LoomDocument, Task } from "../types";

interface Props {
  doc: LoomDocument;
  currentTasks: Task[];
  highlight: NoteHighlight;
  onMoveNode: (nodeId: string, col: number, row: number) => void;
  onReset: () => void;
  onToggleLayout: () => void;
}

type Drag = { id: string; x: number; y: number; dx: number; dy: number };

/**
 * note挿絵 view. Shows the very SVG string the 「note用に書き出す」 export
 * rasterizes (same renderNoteFigure call via currentFigureInput), scaled
 * to the panel width, with a transparent overlay for dragging nodes
 * between note cells. Nothing is laid out twice, so view == export.
 */
export function NoteView({ doc, currentTasks, highlight, onMoveNode, onReset, onToggleLayout }: Props) {
  const fig = useMemo(() => renderNoteFigure(currentFigureInput(doc, currentTasks, highlight)), [doc, currentTasks, highlight]);
  const cells = useMemo(() => noteCells(doc.architecture), [doc.architecture]);
  const pageRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const g = fig.diagram.geometry;
  const top = fig.diagram.top;

  const toFigure = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = pageRef.current!.getBoundingClientRect();
    const k = fig.width / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  };

  const hitNode = (x: number, y: number): string | undefined => {
    for (const [id, cell] of cells) {
      const c = noteCellCenter(g, cell, top);
      if (Math.abs(x - c.x) <= g.nodeW / 2 && Math.abs(y - c.y) <= g.nodeH / 2) return id;
    }
    return undefined;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toFigure(e);
    const id = hitNode(p.x, p.y);
    if (!id) return;
    const c = noteCellCenter(g, cells.get(id)!, top);
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ id, x: p.x, y: p.y, dx: p.x - c.x, dy: p.y - c.y });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toFigure(e);
    setDrag({ ...drag, x: p.x, y: p.y });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const cell = noteCellAt(g, drag.x - drag.dx, drag.y - drag.dy, top);
    setDrag(null);
    onMoveNode(drag.id, cell.col, cell.row);
  };

  const target = drag ? noteCellAt(g, drag.x - drag.dx, drag.y - drag.dy, top) : null;
  const targetCenter = target ? noteCellCenter(g, target, top) : null;

  return (
    <div className="panel architecture-panel note-view">
      <div className="panel-header">
        <div className="panel-title">note挿絵（書き出しと同じ見た目）</div>
        <div className="panel-header-actions">
          <span className="note-view-hint">ノードをドラッグしてマスを移動</span>
          <button onClick={onToggleLayout}>{g.layout === "grid" ? "ハニカム表示" : "グリッド表示"}</button>
          <button onClick={onReset}>配置をリセット</button>
        </div>
      </div>
      <div className="note-view-scroll">
        <div className="note-page" ref={pageRef} style={{ aspectRatio: `${fig.width} / ${fig.height}` }}>
          <div className="note-page-svg" dangerouslySetInnerHTML={{ __html: fig.svg }} />
          <svg
            className="note-page-overlay"
            viewBox={`0 0 ${fig.width} ${fig.height}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            style={{ cursor: drag ? "grabbing" : "grab" }}
          >
            {/* Faint canvas outline: the note diagram area. */}
            <rect
              x={48}
              y={top}
              width={fig.width - 96}
              height={fig.diagram.height}
              fill="none"
              stroke="#94A09A"
              strokeDasharray="12 10"
              strokeWidth={2}
              opacity={0.5}
            />
            {drag && targetCenter && (
              <>
                <rect
                  x={targetCenter.x - g.nodeW / 2}
                  y={targetCenter.y - g.nodeH / 2}
                  width={g.nodeW}
                  height={g.nodeH}
                  rx={18}
                  fill="#2F6B55"
                  fillOpacity={0.12}
                  stroke="#2F6B55"
                  strokeWidth={4}
                  strokeDasharray="14 8"
                />
                <rect
                  x={drag.x - drag.dx - g.nodeW / 2}
                  y={drag.y - drag.dy - g.nodeH / 2}
                  width={g.nodeW}
                  height={g.nodeH}
                  rx={18}
                  fill="#FFFFFF"
                  fillOpacity={0.6}
                  stroke="#1F4437"
                  strokeWidth={4}
                />
              </>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}
