import type { LoomDocument } from "../types";

type Architecture = LoomDocument["architecture"];

/**
 * Maps each original column index to its displayed index, skipping columns
 * that hold no nodes. Returns null for a skipped (empty) column.
 */
export function presentColumnMap(architecture: Architecture): (number | null)[] {
  const used = new Set(architecture.nodes.map((n) => n.col ?? 0));
  const count = Math.max(architecture.columns.length, ...architecture.nodes.map((n) => (n.col ?? 0) + 1));
  const map: (number | null)[] = [];
  let next = 0;
  for (let c = 0; c < count; c++) map.push(used.has(c) ? next++ : null);
  return map;
}

/**
 * Presentation-only view of the architecture: empty columns dropped and the
 * remaining columns compacted so no blank gap remains. Never mutates input.
 */
export function compactForPresent(architecture: Architecture): Architecture {
  const map = presentColumnMap(architecture);
  return {
    ...architecture,
    columns: architecture.columns.filter((_, c) => map[c] !== null),
    nodes: architecture.nodes.map((n) => ({ ...n, col: map[n.col ?? 0] ?? 0 })),
  };
}
