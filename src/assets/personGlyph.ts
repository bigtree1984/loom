/**
 * A plain person glyph (drawn for Loom, no third-party asset) marking
 * human nodes — the one node type that matters for reading a flow (an
 * approval / hand-off point), shown by shape so it adds no colour meaning.
 * 24x24 viewBox: head + shoulders.
 */
export const PERSON_GLYPH_PATHS = {
  head: { cx: 12, cy: 8, r: 4.2 },
  body: "M3.5 21.5c0-4.6 3.8-7.6 8.5-7.6s8.5 3 8.5 7.6z",
} as const;
