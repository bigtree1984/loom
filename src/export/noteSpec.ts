/**
 * note.com figure standards (from 0018_note_fig/public/docs/FIGURE_RULES.md
 * and engine/note.css). note shrinks a 1240px image to 343pt on phones
 * (x0.277), so these are hard floors, not taste.
 */
export const FIGURE_WIDTH = 1240;
export const MARGIN = 48;
export const CONTENT_W = FIGURE_WIDTH - MARGIN * 2;
export const STROKE_MIN = 6;
/** --figure-1: the smallest text allowed (12.2px on a phone). */
export const FONT_1 = 44;
/**
 * Node labels inside the architecture diagram: an explicit exception to the
 * 44px floor (agreed with the user) so 4 grid / 3 hex columns fit 1240px.
 * Everything else stays >= FONT_1.
 */
export const NODE_FONT = 38;
/** --figure-2: standard label. */
export const FONT_2 = 58;
export const LINE_H_RATIO = 1.25;
/** Max characters per line (12.3px per char on a phone at 28). */
export const MAX_CHARS_PER_LINE = 28;

/**
 * Concrete light-theme values of src/theme.css (exports can't resolve CSS
 * variables, and must never pick up the dark theme). color-mix() results
 * are precomputed in sRGB.
 */
export const NOTE_COLORS = {
  bg: "#FFFFFF", // lt1
  panel: "#F7F4EE", // lt2
  border: "#C2C9C5", // accent5
  text: "#1F4437", // dk1
  textSub: "#66776F", // dk2
  edge: "#94A09A", // accent4: muted lines must still read at 6px
  laneA: "#EBEEEC", // accent5 32% into white
  laneB: "#F9FAF9", // accent5 10% into white
  onAccent: "#FFFFFF",
} as const;

export interface NoteRouteColor {
  strong: string;
  textOnStrong: string;
  light: string;
}

const mixIntoPanel = (hex: string, pct: number): string => {
  const p = [0xf7, 0xf4, 0xee];
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v, i) => Math.round(v * pct + p[i] * (1 - pct)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

/** routeColors.ts, resolved: accent1, accent2, accent6, accent3. */
export const NOTE_ROUTE_COLORS: NoteRouteColor[] = [
  { strong: "#2F6B55", textOnStrong: "#FFFFFF", light: mixIntoPanel("#2F6B55", 0.15) },
  { strong: "#FFCB68", textOnStrong: "#1F4437", light: mixIntoPanel("#FFCB68", 0.3) },
  { strong: "#E2773A", textOnStrong: "#FFFFFF", light: mixIntoPanel("#E2773A", 0.15) },
  { strong: "#66776F", textOnStrong: "#FFFFFF", light: mixIntoPanel("#66776F", 0.15) },
];

export const noteRouteColor = (i: number): NoteRouteColor => NOTE_ROUTE_COLORS[i % NOTE_ROUTE_COLORS.length];

export const FONT_FAMILY = `'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`;

const mixIntoWhite = (hex: string, pct: number): string => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${c.map((v) => Math.round(v * pct + 255 * (1 - pct)).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
};

/**
 * Lane colours for the note figure (lane-less canvas: a node's lane is shown
 * by the tint of its cell plus a legend). The first four are Bigtree hues;
 * Bigtree has no blue/purple/rose/teal, so lanes 5-8 borrow muted hues
 * outside the palette — a candidate to add to the Figma variables if kept.
 * `tile` is the cell tint (kept pale so it never competes with the route
 * highlight inside the node); `chip` is the stronger swatch in the legend.
 */
const LANE_HUES = ["#2F6B55", "#FFCB68", "#E2773A", "#66776F", "#4F7CAC", "#8A6FB0", "#C0607A", "#3A8C8C"];
export const NOTE_LANE_COLORS = LANE_HUES.map((h) => ({ tile: mixIntoWhite(h, 0.22), chip: mixIntoWhite(h, 0.6) }));
export const noteLaneColor = (i: number) => NOTE_LANE_COLORS[i % NOTE_LANE_COLORS.length];
