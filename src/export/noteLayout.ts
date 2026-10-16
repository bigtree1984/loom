import { geometryFor } from "../graph/gridGeometry";
import type { ArchLayout } from "../types";
import { CONTENT_W, FONT_1 } from "./noteSpec";

/**
 * Cell geometry scaled to note size. Same cell model as gridGeometry
 * (integer col/row; hex = offset coords, odd rows shifted half a pitch,
 * rows interlocking at sqrt(3)/2 pitch) but the pitch is chosen so that a
 * tier's columns exactly fill the 1144px content width.
 */
export interface NoteCellGeometry {
  layout: ArchLayout;
  pitchX: number;
  pitchY: number;
  nodeW: number;
  nodeH: number;
  /** Usable label width inside a node, px. */
  textW: number;
  oddRowShift: number;
  /** hex: background tile height. */
  tileH: number;
}

/** A node label must fit at least this many full-width chars per line at 44px. */
export const MIN_LABEL_CHARS = 4;
const GRID_NODE_RATIO = 0.82; // node width / pitch; the rest is the arrow gap
const GRID_TEXT_PAD = 16;
const HEX_TEXT_PAD = 14;
const LABEL_LINE_H = 54;

export function noteGeometry(layout: ArchLayout, colsPerTier: number): NoteCellGeometry {
  if (layout === "hex") {
    const base = geometryFor("hex");
    // Odd rows stick out half a pitch, so a tier spans n + 0.5 pitches.
    const pitchX = CONTENT_W / (colsPerTier + 0.5);
    const nodeW = pitchX * (base.nodeW / base.pitchX);
    const nodeH = (nodeW * 2) / Math.sqrt(3);
    return {
      layout,
      pitchX,
      pitchY: (pitchX * Math.sqrt(3)) / 2,
      nodeW,
      nodeH,
      textW: nodeW - HEX_TEXT_PAD * 2,
      oddRowShift: pitchX / 2,
      tileH: (pitchX * 2) / Math.sqrt(3),
    };
  }
  const pitchX = CONTENT_W / colsPerTier;
  const nodeW = pitchX * GRID_NODE_RATIO;
  const nodeH = LABEL_LINE_H * 2 + 32; // two lines of 44px + padding
  return {
    layout,
    pitchX,
    pitchY: nodeH + 48,
    nodeW,
    nodeH,
    textW: nodeW - GRID_TEXT_PAD * 2,
    oddRowShift: 0,
    tileH: nodeH + 48,
  };
}

/** Full-width characters per label line at 44px for `colsPerTier` columns. */
export function labelCharsPerLine(layout: ArchLayout, colsPerTier: number): number {
  return Math.floor(noteGeometry(layout, colsPerTier).textW / FONT_1);
}

/**
 * Most columns one tier can hold while labels still get MIN_LABEL_CHARS
 * per line at 44px — measured from the geometry, not a fixed count.
 * grid: 4 (5 would leave 3 chars), hex: 3.
 */
export function maxColsPerTier(layout: ArchLayout): number {
  let n = 1;
  while (labelCharsPerLine(layout, n + 1) >= MIN_LABEL_CHARS) n++;
  return n;
}

export interface TierPlan {
  /** [startCol, endCol) per tier. */
  tiers: Array<[number, number]>;
  colsPerTier: number;
  warning?: string;
}

/**
 * Splits columns into stacked tiers of equal width. 2 tiers is the
 * expected overflow case (§6); more are allowed but flagged harder.
 */
export function planTiers(columnCount: number, layout: ArchLayout): TierPlan {
  const max = maxColsPerTier(layout);
  const count = Math.max(1, columnCount);
  const tierCount = Math.ceil(count / max);
  const colsPerTier = Math.ceil(count / tierCount);
  const tiers: Array<[number, number]> = [];
  for (let s = 0; s < count; s += colsPerTier) tiers.push([s, Math.min(count, s + colsPerTier)]);
  let warning: string | undefined;
  if (tierCount === 2) {
    warning = `列が${count}列あり、文字44pxでは1段(最大${max}列)に収まらないため2段組にしました。`;
  } else if (tierCount > 2) {
    warning = `列が${count}列あり、${tierCount}段組になりました。note用には列を減らすか図を分けることをおすすめします。`;
  }
  return { tiers, colsPerTier, warning };
}
