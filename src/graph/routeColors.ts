export interface RouteColor {
  strong: { bg: string; border: string; text: string };
  light: { bg: string; border: string; text: string };
  edge: string;
}

/**
 * One strong/light pair per simultaneously-active route, so the same route
 * reads as the same hue across the process-flow panel, the architecture
 * panel, and the task-detail panel. "strong" marks the thing that's
 * actually active right now (a running task, an architecture main node);
 * "light" marks what's merely adjacent to it (a predecessor/successor
 * task, an architecture io node) — same hue, so adjacency reads as "close
 * to route N" instead of introducing an unrelated color.
 */
/** Mix `color` into the panel background (default 15%) for "light" fills. */
const tint = (color: string, pct = 15) =>
  `color-mix(in srgb, ${color} ${pct}%, var(--loom-panel-bg))`;

function makeRoute(color: string, textOnStrong: string): RouteColor {
  return {
    strong: { bg: color, border: color, text: textOnStrong },
    light: { bg: tint(color), border: color, text: "var(--loom-text-primary)" },
    edge: color,
  };
}

// Route 1..4 = accent1 (green), accent2 (yellow), accent6 (orange), accent3
// (gray-green). Yellow needs dark text; the others use the on-accent color
// (white in light mode, dark in dark mode where accents are lightened).
export const ROUTE_COLORS: RouteColor[] = [
  makeRoute("var(--loom-c1)", "var(--loom-on-accent)"),
  makeRoute("var(--loom-c2)", "var(--loom-ink)"),
  makeRoute("var(--loom-c6)", "var(--loom-on-accent)"),
  makeRoute("var(--loom-c3)", "var(--loom-on-accent)"),
];

export function routeColorFor(index: number): RouteColor {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}
