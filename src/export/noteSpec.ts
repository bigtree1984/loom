import type { LoomTheme } from "../types";
import { resolveBase, resolveLaneHues } from "../graph/theme";

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
 * Concrete colours for a note figure. Exports can't resolve CSS variables
 * and must never pick up the dark theme, so these are computed here from
 * the light base palette — with the document's theme overrides applied
 * (src/graph/theme.ts), so a re-branded document exports in its brand.
 * Mixes mirror theme.css (sRGB approximations of its color-mix()).
 */
export interface NoteRouteColor {
  strong: string;
  textOnStrong: string;
  light: string;
}

export interface NotePalette {
  bg: string;
  panel: string;
  border: string;
  text: string;
  textSub: string;
  edge: string;
  route: (i: number) => NoteRouteColor;
  lane: (i: number) => { tile: string; chip: string };
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
/** `pct` of `hex` mixed into `base`. */
const mix = (hex: string, pct: number, base: string) => {
  const a = rgb(hex);
  const b = rgb(base);
  return toHex(a.map((v, i) => v * pct + b[i] * (1 - pct)));
};
/** Relative luminance, to pick readable text on a strong fill. */
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export function notePalette(theme?: LoomTheme): NotePalette {
  const b = resolveBase(theme);
  const routeHues = [b.accent1, b.accent2, b.accent6, b.accent3];
  const routes: NoteRouteColor[] = routeHues.map((h) => ({
    strong: h,
    // Same rule as theme.css: light fills (e.g. yellow) get dark ink.
    textOnStrong: lum(h) > 0.45 ? b.dk1 : b.lt1,
    light: mix(h, lum(h) > 0.45 ? 0.3 : 0.15, b.lt2),
  }));
  const lanes = resolveLaneHues(theme).map((h) => ({ tile: mix(h, 0.22, b.lt1), chip: mix(h, 0.6, b.lt1) }));
  return {
    bg: b.lt1,
    panel: b.lt2,
    border: b.accent5,
    text: b.dk1,
    textSub: b.dk2,
    edge: b.accent4, // muted lines must still read at 6px
    route: (i) => routes[i % routes.length],
    lane: (i) => lanes[i % lanes.length],
  };
}

export const FONT_FAMILY = `'Noto Sans JP', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', sans-serif`;
