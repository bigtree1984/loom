import type { ArchNodeColorToken, ArchNodeType, LoomDocument, Task } from "../types";
import { noteCells, noteColumnCount } from "../graph/noteCells";
import { NODE_LINE_H as NODE_LH, noteCellCenter, noteDiagramHeight, noteGeometry, type NoteCellGeometry } from "./noteLayout";
import {
  CONTENT_W,
  FIGURE_WIDTH,
  FONT_1,
  FONT_2,
  FONT_FAMILY,
  LINE_H_RATIO,
  MARGIN,
  NODE_FONT,
  NOTE_COLORS as C,
  STROKE_MIN,
  noteRouteColor,
} from "./noteSpec";
import { wrapText } from "./textWrap";

/** Same shape as useLoomState's highlightedArchNodes. */
export type NoteHighlight = Map<string, { role: "main" | "io"; routeIndex: number }>;

export interface NoteFigureInput {
  doc: LoomDocument;
  /** Tasks in list order (numbered list under the diagram). */
  orderedTasks: Task[];
  /** Step figure: highlighted nodes + the tasks shown in the band. */
  highlight?: NoteHighlight;
  stepTasks?: Task[];
  /** 1-based step label, e.g. "STEP 3 / 12". */
  stepLabel?: string;
}

export interface NoteFigure {
  svg: string;
  width: number;
  height: number;
  warnings: string[];
  /** Every character drawn, for font subsetting. */
  text: string;
  /** Where the architecture diagram sits, so the note view can map pointer -> cell. */
  diagram: { top: number; height: number; geometry: NoteCellGeometry };
}

const COLOR_TOKEN_BY_TYPE: Record<ArchNodeType, ArchNodeColorToken> = {
  frontend: "color_1",
  backend: "color_2",
  agent: "color_3",
  storage: "color_4",
  human: "color_5",
  spacer: "color_1",
};

const LH1 = Math.round(FONT_1 * LINE_H_RATIO);
const LH2 = Math.round(FONT_2 * LINE_H_RATIO);
const ARROW = 30;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

class Svg {
  parts: string[] = [];
  text = "";
  push(s: string) {
    this.parts.push(s);
  }
  /** Multi-line text; `y` is the first baseline. */
  lines(lines: string[], x: number, y: number, o: { size: number; lh: number; fill: string; weight?: number; anchor?: string }) {
    lines.forEach((l, i) => {
      this.text += l;
      this.push(
        `<text x="${r(x)}" y="${r(y + i * o.lh)}" font-size="${o.size}" font-weight="${o.weight ?? 400}" fill="${o.fill}"${
          o.anchor ? ` text-anchor="${o.anchor}"` : ""
        }>${esc(l)}</text>`,
      );
    });
  }
}

const r = (n: number) => Math.round(n * 10) / 10;

function hexPoints(cx: number, cy: number, w: number, h: number): string {
  const pts = [
    [cx, cy - h / 2],
    [cx + w / 2, cy - h / 4],
    [cx + w / 2, cy + h / 4],
    [cx, cy + h / 2],
    [cx - w / 2, cy + h / 4],
    [cx - w / 2, cy - h / 4],
  ];
  return pts.map(([x, y]) => `${r(x)},${r(y)}`).join(" ");
}

/** Pull (x2,y2) back toward (x1,y1) until it leaves the node's box. */
function clipToBox(x1: number, y1: number, x2: number, y2: number, hw: number, hh: number): [number, number] {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  return [x2 + dx * t, y2 + dy * t];
}

export function renderNoteFigure(input: NoteFigureInput): NoteFigure {
  const { doc, orderedTasks, highlight, stepTasks, stepLabel } = input;
  const arch = doc.architecture;
  const layout = arch.layout ?? "grid";
  const g: NoteCellGeometry = noteGeometry(layout, noteColumnCount(layout));
  const warnings: string[] = [];

  const svg = new Svg();
  let y = MARGIN;

  // ---- Step band -------------------------------------------------------
  if (stepTasks && stepTasks.length > 0) {
    const bandParts = new Svg();
    let by = y + 36;
    if (stepLabel) {
      bandParts.lines([stepLabel], MARGIN + 48, by + FONT_1 * 0.85, { size: FONT_1, lh: LH1, fill: C.textSub, weight: 700 });
      by += LH1 + 8;
    }
    const innerW = CONTENT_W - 48 - 36;
    stepTasks.slice(0, 3).forEach((t, i) => {
      const nameLines = wrapText(t.label, { maxEm: innerW / FONT_2, maxLines: 2 });
      bandParts.lines(nameLines, MARGIN + 48, by + FONT_2 * 0.85, { size: FONT_2, lh: LH2, fill: C.text, weight: 700 });
      by += nameLines.length * LH2 + 8;
      const descLines = t.description
        ? wrapText(t.description, { maxEm: innerW / FONT_1, maxLines: stepTasks.length > 1 ? 2 : 4 })
        : [];
      bandParts.lines(descLines, MARGIN + 48, by + FONT_1 * 0.85, { size: FONT_1, lh: LH1, fill: C.text });
      by += descLines.length * LH1 + (i < stepTasks.length - 1 ? 32 : 0);
    });
    if (stepTasks.length > 3) warnings.push(`同時に${stepTasks.length}タスクが進行中のため、帯には先頭3件だけ載せました。`);
    const bandH = by - y + 36;
    const accent = noteRouteColor(highlight?.get(stepTasks[0].mainNode)?.routeIndex ?? 0).strong;
    svg.push(`<rect x="${MARGIN}" y="${y}" width="${CONTENT_W}" height="${r(bandH)}" rx="16" fill="${C.panel}"/>`);
    svg.push(`<rect x="${MARGIN}" y="${y}" width="16" height="${r(bandH)}" rx="8" fill="${accent}"/>`);
    svg.parts.push(...bandParts.parts);
    svg.text += bandParts.text;
    y += bandH + 48;
  }

  // ---- Architecture: lane-less canvas placed by noteCells -------------
  const diagramTop = y;
  const cells = noteCells(arch);
  const rows = Math.max(1, ...[...cells.values()].map((c) => c.row + 1));
  const centers = new Map<string, { x: number; y: number }>();
  const nodeSvg = new Svg();
  const edgeSvg: string[] = [];
  const labelEm = g.textW / NODE_FONT;

  arch.nodes.forEach((nd) => {
    const cell = cells.get(nd.id);
    if (!cell) return;
    const p = noteCellCenter(g, cell, diagramTop);
    centers.set(nd.id, p);
    const h = highlight?.get(nd.id);
    const route = h ? noteRouteColor(h.routeIndex) : undefined;
    const fill = h?.role === "main" ? route!.strong : h?.role === "io" ? route!.light : C.bg;
    const stroke = route ? route.strong : C.border;
    const textFill = h?.role === "main" ? route!.textOnStrong : C.text;
    const shape =
      layout === "hex"
        ? `<polygon points="${hexPoints(p.x, p.y, g.nodeW, g.nodeH)}"`
        : `<rect x="${r(p.x - g.nodeW / 2)}" y="${r(p.y - g.nodeH / 2)}" width="${r(g.nodeW)}" height="${r(g.nodeH)}" rx="18"`;
    nodeSvg.push(`${shape} fill="${fill}" stroke="${stroke}" stroke-width="${STROKE_MIN}"/>`);
    const dot = C.dots[nd.colorToken ?? COLOR_TOKEN_BY_TYPE[nd.type]];
    const [dx, dy] =
      layout === "hex" ? [p.x, p.y - g.nodeH / 2 + 34] : [p.x - g.nodeW / 2 + 4, p.y - g.nodeH / 2 + 4];
    nodeSvg.push(`<circle cx="${r(dx)}" cy="${r(dy)}" r="14" fill="${dot}" stroke="${C.bg}" stroke-width="${STROKE_MIN}"/>`);
    const lines = wrapText(nd.label, { maxEm: labelEm, maxLines: 2 });
    const firstBaseline = p.y - ((lines.length - 1) * NODE_LH) / 2 + NODE_FONT * 0.36;
    nodeSvg.lines(lines, p.x, firstBaseline, {
      size: NODE_FONT,
      lh: NODE_LH,
      fill: textFill,
      weight: h?.role === "main" ? 700 : 500,
      anchor: "middle",
    });
  });
  y = diagramTop + noteDiagramHeight(g, rows);

  // ---- Edges (drawn under nodes) ----------------------------------------
  const hw = g.nodeW / 2 + 4;
  const hh = (layout === "hex" ? g.nodeH * 0.38 : g.nodeH / 2) + 4;
  const markers = new Map<string, string>();
  const markerFor = (color: string) => {
    const id = `a${color.slice(1)}`;
    if (!markers.has(color)) {
      markers.set(
        color,
        `<marker id="${id}" viewBox="0 0 10 10" refX="0" refY="5" markerUnits="userSpaceOnUse" markerWidth="${ARROW}" markerHeight="${ARROW}" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`,
      );
    }
    return id;
  };
  arch.edges.forEach((e) => {
    const a = centers.get(e.from);
    const b = centers.get(e.to);
    if (!a || !b) return;
    const ha = highlight?.get(e.from);
    const hb = highlight?.get(e.to);
    const active = ha && hb && ha.routeIndex === hb.routeIndex && (ha.role === "main" || hb.role === "main");
    const color = active ? noteRouteColor(ha.routeIndex).strong : C.edge;
    let [x1, y1] = clipToBox(b.x, b.y, a.x, a.y, hw, hh);
    let [x2, y2] = clipToBox(a.x, a.y, b.x, b.y, hw, hh);
    const len = Math.hypot(x2 - x1, y2 - y1);
    // Never drop an edge silently: if the nodes are too close for shaft +
    // head, still draw the arrowhead (shrinking the shaft to zero).
    if (len < 1) return;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // Leave room for the arrowhead so the line doesn't poke through it.
    const head = Math.min(ARROW, len * 0.6);
    x2 -= ux * head;
    y2 -= uy * head;
    if (e.bidirectional) {
      x1 += ux * ARROW;
      y1 += uy * ARROW;
    }
    const m = markerFor(color);
    edgeSvg.push(
      `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${color}" stroke-width="${active ? STROKE_MIN + 2 : STROKE_MIN}" stroke-linecap="round" marker-end="url(#${m})"${
        e.bidirectional ? ` marker-start="url(#${m})"` : ""
      }/>`,
    );
  });
  svg.parts.push(...edgeSvg);
  svg.parts.push(...nodeSvg.parts);
  svg.text += nodeSvg.text;

  // ---- Numbered task list -----------------------------------------------
  if (orderedTasks.length > 0) {
    y += 64;
    svg.push(`<line x1="${MARGIN}" y1="${y}" x2="${FIGURE_WIDTH - MARGIN}" y2="${y}" stroke="${C.border}" stroke-width="${STROKE_MIN}"/>`);
    y += 40;
    const current = new Set((stepTasks ?? []).map((t) => t.id));
    const numW = FONT_1 * 2.2;
    orderedTasks.forEach((t, i) => {
      const isCur = current.has(t.id);
      const lines = wrapText(t.label, { maxEm: (CONTENT_W - numW - 24) / FONT_1, maxLines: 2 });
      const blockH = lines.length * LH1;
      if (isCur) {
        const accent = noteRouteColor(highlight?.get(t.mainNode)?.routeIndex ?? 0);
        svg.push(`<rect x="${MARGIN}" y="${y - 6}" width="${CONTENT_W}" height="${blockH + 12}" rx="12" fill="${accent.light}"/>`);
        svg.push(`<rect x="${MARGIN}" y="${y - 6}" width="12" height="${blockH + 12}" rx="6" fill="${accent.strong}"/>`);
      }
      svg.lines([`${i + 1}.`], MARGIN + numW, y + FONT_1 * 0.85, {
        size: FONT_1,
        lh: LH1,
        fill: C.textSub,
        weight: 700,
        anchor: "end",
      });
      svg.lines(lines, MARGIN + numW + 20, y + FONT_1 * 0.85, {
        size: FONT_1,
        lh: LH1,
        fill: C.text,
        weight: isCur ? 700 : 400,
      });
      y += blockH + 16;
    });
  }

  const height = Math.ceil(y + MARGIN);
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${FIGURE_WIDTH}" height="${height}" viewBox="0 0 ${FIGURE_WIDTH} ${height}" font-family="${FONT_FAMILY}">`,
    `<!--FONTS-->`,
    `<defs>${[...markers.values()].join("")}</defs>`,
    `<rect width="100%" height="100%" fill="${C.bg}"/>`,
    ...svg.parts,
    `</svg>`,
  ].join("\n");
  return {
    svg: out,
    width: FIGURE_WIDTH,
    height,
    warnings,
    text: svg.text,
    diagram: { top: diagramTop, height: noteDiagramHeight(g, rows), geometry: g },
  };
}
