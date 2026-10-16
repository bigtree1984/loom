import { geometryFor } from "../graph/gridGeometry";
import type { NoteCell } from "../graph/noteCells";
import type { ArchLayout } from "../types";
import { CONTENT_W, LINE_H_RATIO, MARGIN, NODE_FONT } from "./noteSpec";

/**
 * Cell geometry scaled to note size. Same cell model as gridGeometry
 * (integer col/row; hex = offset coords, odd rows shifted half a pitch,
 * rows interlocking at sqrt(3)/2 pitch) but the pitch is chosen so that
 * `cols` columns exactly fill the 1144px content width. The note canvas is
 * always noteColumnCount(layout) wide and grows downward; there is no tier
 * splitting — the user arranges the cells in the note view.
 */
export interface NoteCellGeometry {
  layout: ArchLayout;
  cols: number;
  pitchX: number;
  pitchY: number;
  nodeW: number;
  nodeH: number;
  /** Usable label width inside a node, px. */
  textW: number;
  oddRowShift: number;
  /** hex: height of one pitch-sized hex (vertical extent of a row). */
  tileH: number;
}

const GRID_NODE_RATIO = 0.82; // node width / pitch; the rest is the arrow gap
const GRID_TEXT_PAD = 14;
const HEX_TEXT_PAD = 14;
export const NODE_LINE_H = Math.round(NODE_FONT * LINE_H_RATIO);

/** Vertical gap between grid rows in the note figure, px. */
export const NOTE_ROW_GAP = 96;

export function noteGeometry(layout: ArchLayout, cols: number): NoteCellGeometry {
  if (layout === "hex") {
    const base = geometryFor("hex");
    // Odd rows stick out half a pitch, so the canvas spans n + 0.5 pitches.
    const pitchX = CONTENT_W / (cols + 0.5);
    const nodeW = pitchX * (base.nodeW / base.pitchX);
    const nodeH = (nodeW * 2) / Math.sqrt(3);
    return {
      layout,
      cols,
      pitchX,
      pitchY: (pitchX * Math.sqrt(3)) / 2,
      nodeW,
      nodeH,
      textW: nodeW - HEX_TEXT_PAD * 2,
      oddRowShift: pitchX / 2,
      tileH: (pitchX * 2) / Math.sqrt(3),
    };
  }
  const pitchX = CONTENT_W / cols;
  const nodeW = pitchX * GRID_NODE_RATIO;
  const nodeH = NODE_LINE_H * 2 + 40; // two label lines + padding
  return {
    layout,
    cols,
    pitchX,
    // Row gap must fit an arrowhead plus visible shaft between vertically
    // stacked nodes (it was 48px and those edges got dropped as too short).
    pitchY: nodeH + NOTE_ROW_GAP,
    nodeW,
    nodeH,
    textW: nodeW - GRID_TEXT_PAD * 2,
    oddRowShift: 0,
    tileH: nodeH + NOTE_ROW_GAP,
  };
}

/** Height of a diagram with `rows` rows (at least one row). */
export function noteDiagramHeight(g: NoteCellGeometry, rows: number): number {
  const n = Math.max(1, rows);
  return g.layout === "hex" ? (n - 1) * g.pitchY + g.tileH : n * g.pitchY;
}

/** Center of a cell, with the diagram's top edge at `top` (x starts at MARGIN). */
export function noteCellCenter(g: NoteCellGeometry, cell: NoteCell, top: number): { x: number; y: number } {
  const shift = cell.row % 2 === 1 ? g.oddRowShift : 0;
  return {
    x: MARGIN + (cell.col + 0.5) * g.pitchX + shift,
    y: g.layout === "hex" ? top + g.tileH / 2 + cell.row * g.pitchY : top + cell.row * g.pitchY + g.pitchY / 2,
  };
}

/** Inverse of noteCellCenter: nearest cell to a point (clamped to the canvas width, row >= 0). */
export function noteCellAt(g: NoteCellGeometry, x: number, y: number, top: number): NoteCell {
  const rowF = g.layout === "hex" ? (y - top - g.tileH / 2) / g.pitchY : (y - top - g.pitchY / 2) / g.pitchY;
  const row = Math.max(0, Math.round(rowF));
  const shift = row % 2 === 1 ? g.oddRowShift : 0;
  const col = Math.round((x - MARGIN - shift) / g.pitchX - 0.5);
  return { col: Math.max(0, Math.min(g.cols - 1, col)), row };
}
