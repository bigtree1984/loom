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
 * to route N" instead of introducing an unrelated color. Index 0 (amber)
 * is the app's original single-task accent color, kept first so the
 * common non-parallel case renders exactly as before.
 */
export const ROUTE_COLORS: RouteColor[] = [
  {
    strong: { bg: "#EF9F27", border: "#854F0B", text: "#412402" },
    light: { bg: "#FAEEDA", border: "#EF9F27", text: "#854F0B" },
    edge: "#BA7517",
  },
  {
    strong: { bg: "#AFA9EC", border: "#534AB7", text: "#26215C" },
    light: { bg: "#EEEDFE", border: "#AFA9EC", text: "#534AB7" },
    edge: "#534AB7",
  },
  {
    strong: { bg: "#ED93B1", border: "#993556", text: "#4B1528" },
    light: { bg: "#FBEAF0", border: "#ED93B1", text: "#993556" },
    edge: "#993556",
  },
  {
    strong: { bg: "#F0997B", border: "#993C1D", text: "#4A1B0C" },
    light: { bg: "#FAECE7", border: "#F0997B", text: "#993C1D" },
    edge: "#993C1D",
  },
];

export function routeColorFor(index: number): RouteColor {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}
