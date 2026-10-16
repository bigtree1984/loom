import type { ArchLayout } from "../types";

/**
 * Cell <-> pixel conversion for the architecture grid. Data is always
 * integer (col, row); switching grid <-> hex changes only this mapping,
 * never the stored cells.
 *
 * hex uses offset coordinates (odd rows shifted half a cell right) rather
 * than an axial / 60-degree skew, so the overall shape stays rectangular
 * and a diagram toggled between the two layouts keeps its silhouette.
 */

/** y of the column header row (above row 0). */
export const HEADER_Y = -48; // header (~16px tall) sits ~31px above row 0

export const GRID_NODE_W = 168;
export const GRID_NODE_H = 64;
const GRID_GAP_X = 96;
const GRID_GAP_Y = 24;

/** Flat-sided width of a pointy-top hexagon node. */
export const HEX_NODE_W = 150;
/** Pointy-top hex height = width * 2/sqrt(3). */
export const HEX_NODE_H = Math.round((HEX_NODE_W * 2) / Math.sqrt(3));
// Wide enough that a node sits well inside its lane tile and edges between
// neighbouring hexes have visible length.
const HEX_GAP = 40;

export interface CellGeometry {
  /** Size of the node box drawn in a cell. */
  nodeW: number;
  nodeH: number;
  /** Horizontal distance between neighbouring columns (same row). */
  pitchX: number;
  /** Vertical distance between neighbouring rows. */
  pitchY: number;
  /** Extra x offset applied to odd rows (0 for grid). */
  oddRowShift: number;
}

export function geometryFor(layout: ArchLayout): CellGeometry {
  if (layout === "hex") {
    const pitchX = HEX_NODE_W + HEX_GAP;
    return {
      nodeW: HEX_NODE_W,
      nodeH: HEX_NODE_H,
      pitchX,
      // Rows of pointy-top hexes interlock at 3/4 of a hex's height; using
      // the pitch-sized hex (pitchX wide) keeps background tiles exact.
      pitchY: (pitchX * Math.sqrt(3)) / 2,
      oddRowShift: pitchX / 2,
    };
  }
  return {
    nodeW: GRID_NODE_W,
    nodeH: GRID_NODE_H,
    pitchX: GRID_NODE_W + GRID_GAP_X,
    pitchY: GRID_NODE_H + GRID_GAP_Y,
    oddRowShift: 0,
  };
}

/** Top-left pixel position of the node in (col, row). */
export function cellToPixel(col: number, row: number, layout: ArchLayout): { x: number; y: number } {
  const g = geometryFor(layout);
  return { x: col * g.pitchX + (isOdd(row) ? g.oddRowShift : 0), y: row * g.pitchY };
}

/** Nearest cell to a node's top-left pixel position (inverse of cellToPixel). */
export function pixelToCell(x: number, y: number, layout: ArchLayout): { col: number; row: number } {
  const g = geometryFor(layout);
  const row = Math.max(0, Math.round(y / g.pitchY));
  const col = Math.max(0, Math.round((x - (isOdd(row) ? g.oddRowShift : 0)) / g.pitchX));
  return { col, row };
}

/** x of a column's header (row 0 alignment). */
export function columnX(col: number, layout: ArchLayout): number {
  return col * geometryFor(layout).pitchX;
}

function isOdd(n: number): boolean {
  return Math.abs(n) % 2 === 1;
}

/**
 * Background tile for a cell, sized to the cell pitch so neighbouring
 * tiles touch with no gap: a column reads as one continuous lane.
 * grid: a pitchX x pitchY rectangle centred on the node.
 * hex : a pointy-top hexagon pitchX wide — at that size rows interlock
 *       exactly, since 0.75 * height equals pitchY.
 */
export function laneTileRect(col: number, row: number, layout: ArchLayout): { x: number; y: number; w: number; h: number } {
  const g = geometryFor(layout);
  const { x, y } = cellToPixel(col, row, layout);
  const cx = x + g.nodeW / 2;
  const cy = y + g.nodeH / 2;
  const w = g.pitchX;
  const h = layout === "hex" ? (g.pitchX * 2) / Math.sqrt(3) : g.pitchY;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
