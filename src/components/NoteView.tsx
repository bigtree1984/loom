import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

const MIN_SCALE = 0.1;
const MAX_SCALE = 2;
const STEP = 1.25;

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

  // Zoom. scale = on-screen px per figure px (1 = the exported PNG's actual
  // size); null = fit the panel width (as before zoom existed), tracking resizes.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);
  const [fitScale, setFitScale] = useState(0.5);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const pad = 32;
      setFitScale(Math.max(MIN_SCALE, Math.min(1, (el.clientWidth - pad) / fig.width)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fig.width, fig.height]);
  const shown = scale ?? fitScale;
  // Keep the point under the cursor (or the panel centre) fixed while zooming.
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const el = scrollRef.current;
    const page = pageRef.current;
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
    if (el && page) {
      const er = el.getBoundingClientRect();
      const pr = page.getBoundingClientRect();
      const vx = (clientX ?? er.left + er.width / 2) - er.left;
      const vy = (clientY ?? er.top + er.height / 2) - er.top;
      anchor.current = { fx: (er.left + vx - pr.left) / shown, fy: (er.top + vy - pr.top) / shown, vx, vy };
    }
    setScale(clamped);
  };
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const page = pageRef.current;
    const a = anchor.current;
    if (!el || !page || !a) return;
    anchor.current = null;
    el.scrollLeft = page.offsetLeft + a.fx * shown - a.vx;
    el.scrollTop = page.offsetTop + a.fy * shown - a.vy;
  }, [shown]);
  // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as ctrl+wheel).
  // Needs a non-passive listener to stop the browser's own page zoom.
  const zoomRef = useRef(zoomTo);
  zoomRef.current = zoomTo;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomRef.current(shownRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
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
          <span className="note-zoom" role="group" aria-label="拡大縮小">
            <button onClick={() => zoomTo(shown / STEP)} aria-label="縮小" disabled={shown <= MIN_SCALE}>
              −
            </button>
            <span className="note-zoom-value" title="書き出しサイズに対する倍率">{Math.round(shown * 100)}%</span>
            <button onClick={() => zoomTo(shown * STEP)} aria-label="拡大" disabled={shown >= MAX_SCALE}>
              ＋
            </button>
            <button onClick={() => setScale(null)} aria-pressed={scale === null}>
              幅に合わせる
            </button>
          </span>
          <button onClick={onToggleLayout}>{g.layout === "grid" ? "ハニカム表示" : "グリッド表示"}</button>
          <button onClick={onReset}>配置をリセット</button>
        </div>
      </div>
      <div className="note-view-scroll" ref={scrollRef}>
        <div
          className="note-page"
          ref={pageRef}
          style={{ width: fig.width * shown, height: fig.height * shown }}
        >
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
