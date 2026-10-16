import type { ArchLayout, ArchNode, LoomDocument } from "../types";

/**
 * The note illustration view is a lane-less, fixed-width canvas: as many
 * columns as fit 1240px at note text size (grid 4, hex 3 — see
 * src/export/noteLayout.ts), growing downward. Nodes may carry their own
 * noteCol/noteRow; the rest are derived here so the view always has a
 * complete, overlap-free placement without touching the screen layout.
 */
export function noteColumnCount(layout: ArchLayout): number {
  return layout === "hex" ? 3 : 4;
}

export type NoteCell = { col: number; row: number };

/**
 * Effective note cell for every node.
 *  - explicit noteCol/noteRow win (clamped into the canvas width);
 *  - the rest keep the screen diagram's reading order: screen columns are
 *    laid side by side and wrapped into bands of `cols` columns, each band
 *    starting below the previous one — the same shape the first note
 *    export used, but now only as a starting point the user then edits.
 */
export function noteCells(arch: LoomDocument["architecture"]): Map<string, NoteCell> {
  const cols = noteColumnCount(arch.layout ?? "grid");
  const out = new Map<string, NoteCell>();
  const taken = new Set<string>();
  const key = (c: number, r: number) => `${c},${r}`;

  for (const n of arch.nodes) {
    if (n.noteCol === undefined || n.noteRow === undefined) continue;
    let c = Math.min(n.noteCol, cols - 1);
    let r = n.noteRow;
    while (taken.has(key(c, r))) r++;
    taken.add(key(c, r));
    out.set(n.id, { col: c, row: r });
  }

  const rest = arch.nodes.filter((n) => !out.has(n.id));
  if (rest.length === 0) return out;

  // Bands of `cols` screen columns; each band as tall as its tallest
  // screen column (in screen rows, compacted to rows actually used).
  const screenCols = [...new Set(rest.map((n) => n.col ?? 0))].sort((a, b) => a - b);
  const bandOf = new Map<number, number>();
  screenCols.forEach((sc, i) => bandOf.set(sc, Math.floor(i / cols)));
  const slotOf = new Map<number, number>();
  screenCols.forEach((sc, i) => slotOf.set(sc, i % cols));

  const bandRows = new Map<number, number[]>(); // band -> sorted distinct screen rows
  rest.forEach((n) => {
    const b = bandOf.get(n.col ?? 0)!;
    const rows = bandRows.get(b) ?? [];
    if (!rows.includes(n.row ?? 0)) rows.push(n.row ?? 0);
    bandRows.set(b, rows);
  });
  bandRows.forEach((rows) => rows.sort((a, b) => a - b));

  // Explicitly placed nodes push the auto bands below them.
  let rowBase = Math.max(-1, ...[...out.values()].map((c) => c.row)) + 1;
  const bands = [...bandRows.keys()].sort((a, b) => a - b);
  const startOf = new Map<number, number>();
  for (const b of bands) {
    startOf.set(b, rowBase);
    rowBase += bandRows.get(b)!.length;
  }

  const ordered = [...rest].sort((a, b) => (a.col ?? 0) - (b.col ?? 0) || (a.row ?? 0) - (b.row ?? 0));
  for (const n of ordered) {
    const b = bandOf.get(n.col ?? 0)!;
    const c = slotOf.get(n.col ?? 0)!;
    let r = startOf.get(b)! + bandRows.get(b)!.indexOf(n.row ?? 0);
    while (taken.has(key(c, r))) r++;
    taken.add(key(c, r));
    out.set(n.id, { col: c, row: r });
  }
  return out;
}

/**
 * Move a node in the note view. The first edit freezes every node's
 * current effective note cell into the document, so the derived placement
 * can't shift under the user afterwards. A taken target cell trades places.
 */
export function moveNodeToNoteCell(doc: LoomDocument, nodeId: string, col: number, row: number): LoomDocument {
  const a = doc.architecture;
  const cols = noteColumnCount(a.layout ?? "grid");
  const c = Math.max(0, Math.min(col, cols - 1));
  const r = Math.max(0, row);
  const cells = noteCells(a);
  const from = cells.get(nodeId);
  if (!from || (from.col === c && from.row === r)) return freezeNoteCells(doc, cells);
  const occupant = a.nodes.find((n) => n.id !== nodeId && cells.get(n.id)?.col === c && cells.get(n.id)?.row === r);
  const next = new Map(cells);
  next.set(nodeId, { col: c, row: r });
  if (occupant) next.set(occupant.id, from);
  return freezeNoteCells(doc, next);
}

/** Forget all note placement (back to deriving it from the screen layout). */
export function resetNoteCells(doc: LoomDocument): LoomDocument {
  return {
    ...doc,
    architecture: {
      ...doc.architecture,
      nodes: doc.architecture.nodes.map(({ noteCol: _c, noteRow: _r, ...n }) => n),
    },
  };
}

function freezeNoteCells(doc: LoomDocument, cells: Map<string, NoteCell>): LoomDocument {
  // Drop empty leading rows so the figure starts at the top. In hex the
  // trim must be even: shifting by an odd count would flip which rows are
  // offset and change the shape.
  const minRow = Math.min(...[...cells.values()].map((v) => v.row));
  let shift = Number.isFinite(minRow) ? minRow : 0;
  if ((doc.architecture.layout ?? "grid") === "hex") shift -= shift % 2;
  const nodes: ArchNode[] = doc.architecture.nodes.map((n) => {
    const v = cells.get(n.id);
    return v ? { ...n, noteCol: v.col, noteRow: v.row - shift } : n;
  });
  return { ...doc, architecture: { ...doc.architecture, nodes } };
}
