import type { ArchColumn, LoomDocument } from "../types";

/**
 * Pure edit operations on a normalized (v2) document's grid. Each returns
 * a new document; the caller feeds it back through loadDocument (which
 * re-normalizes, so collisions can't survive even if one slipped through).
 */

type Arch = LoomDocument["architecture"];

function withArch(doc: LoomDocument, arch: Partial<Arch>): LoomDocument {
  return { ...doc, architecture: { ...doc.architecture, ...arch } };
}

/** Columns can exist without a header (nodes placed past the last declared
 * column); pad with blank headers so index-based ops stay aligned. */
function paddedColumns(arch: Arch, upTo: number): ArchColumn[] {
  const cols = [...arch.columns];
  const used = new Set(cols.map((c) => c.id));
  for (let i = cols.length; i <= upTo; i++) {
    let id = `col_${i}`;
    while (used.has(id)) id += "_";
    used.add(id);
    cols.push({ id, label: "" });
  }
  return cols;
}

/** Swap column `i` with column `i + 1`, headers and nodes together. */
export function swapColumns(doc: LoomDocument, i: number): LoomDocument {
  const a = doc.architecture;
  if (i < 0) return doc;
  const columns = paddedColumns(a, i + 1);
  [columns[i], columns[i + 1]] = [columns[i + 1], columns[i]];
  const nodes = a.nodes.map((n) => (n.col === i ? { ...n, col: i + 1 } : n.col === i + 1 ? { ...n, col: i } : n));
  return withArch(doc, { columns, nodes });
}

/** Move a node to a cell. If another node is there, the two trade places. */
export function moveNodeToCell(doc: LoomDocument, nodeId: string, col: number, row: number): LoomDocument {
  const a = doc.architecture;
  const moving = a.nodes.find((n) => n.id === nodeId);
  if (!moving || (moving.col === col && moving.row === row)) return doc;
  const occupant = a.nodes.find((n) => n.id !== nodeId && n.col === col && n.row === row);
  const nodes = a.nodes.map((n) => {
    if (n.id === nodeId) return { ...n, col, row };
    if (occupant && n.id === occupant.id) return { ...n, col: moving.col, row: moving.row };
    return n;
  });
  return withArch(doc, { nodes });
}

/** Append a headed, empty column at the right edge. */
export function addColumn(doc: LoomDocument, column: ArchColumn): LoomDocument {
  const a = doc.architecture;
  const maxCol = Math.max(-1, ...a.nodes.map((n) => n.col ?? 0));
  const columns = paddedColumns(a, maxCol);
  return withArch(doc, { columns: [...columns, column] });
}

export function renameColumn(doc: LoomDocument, id: string, label: string): LoomDocument {
  return withArch(doc, { columns: doc.architecture.columns.map((c) => (c.id === id ? { ...c, label } : c)) });
}

/** Remove an empty column; later columns (and their nodes) shift left.
 * Returns null if the column still has nodes. */
export function removeColumn(doc: LoomDocument, id: string): LoomDocument | null {
  const a = doc.architecture;
  const col = a.columns.findIndex((c) => c.id === id);
  if (col < 0) return doc;
  if (a.nodes.some((n) => n.col === col)) return null;
  const columns = a.columns.filter((_, i) => i !== col);
  const nodes = a.nodes.map((n) => ((n.col ?? 0) > col ? { ...n, col: (n.col ?? 0) - 1 } : n));
  return withArch(doc, { columns, nodes });
}

export function nodesInColumn(doc: LoomDocument, id: string): number {
  const col = doc.architecture.columns.findIndex((c) => c.id === id);
  return col < 0 ? 0 : doc.architecture.nodes.filter((n) => n.col === col).length;
}
