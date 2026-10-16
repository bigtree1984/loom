import type { LoomTheme } from "../types";

/**
 * Bigtree Lab base colours (Figma 0MH0fNiTtcID0nw201lJkx / office-theme,
 * exported 2026-09-19). Every other colour — route highlights, lane tints,
 * the whole dark theme — is derived from these, so a document can re-brand
 * Loom by overriding just these values (LoomDocument.theme).
 */
export const BASE_COLORS = {
  dk1: "#1F4437",
  dk2: "#66776F",
  lt1: "#FFFFFF",
  lt2: "#F7F4EE",
  accent1: "#2F6B55",
  accent2: "#FFCB68",
  accent3: "#66776F",
  accent4: "#94A09A",
  accent5: "#C2C9C5",
  accent6: "#E2773A",
} as const;

export type BaseColorName = keyof typeof BASE_COLORS;
export const BASE_COLOR_NAMES = Object.keys(BASE_COLORS) as BaseColorName[];

/** Lane hues for the note figure; first four are Bigtree, 5-8 are borrowed. */
export const DEFAULT_LANE_HUES = ["#2F6B55", "#FFCB68", "#E2773A", "#66776F", "#4F7CAC", "#8A6FB0", "#C0607A", "#3A8C8C"];

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (v: unknown): v is string => typeof v === "string" && HEX.test(v);

/** Keep only well-formed overrides (#RRGGBB); anything else is dropped. */
export function sanitizeTheme(raw: unknown): LoomTheme | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: LoomTheme = {};
  for (const k of BASE_COLOR_NAMES) if (isHexColor(r[k])) out[k] = (r[k] as string).toUpperCase();
  if (Array.isArray(r.lanes)) {
    const lanes = r.lanes.filter(isHexColor).map((c) => c.toUpperCase());
    if (lanes.length) out.lanes = lanes;
  }
  return Object.keys(out).length ? out : undefined;
}

export function resolveBase(theme: LoomTheme | undefined): Record<BaseColorName, string> {
  const out = { ...BASE_COLORS } as Record<BaseColorName, string>;
  for (const k of BASE_COLOR_NAMES) if (theme?.[k]) out[k] = theme[k]!;
  return out;
}

export function resolveLaneHues(theme: LoomTheme | undefined): string[] {
  return theme?.lanes?.length ? theme.lanes : DEFAULT_LANE_HUES;
}

/**
 * Apply overrides as --bt-* custom properties on <html>. They must sit on
 * the root element: theme.css derives --loom-* from --bt-* *at :root*, and
 * custom properties resolve var() where they're declared, so an override
 * on a descendant would never reach the derived values. Unset names are
 * removed so switching documents doesn't leave a previous brand behind.
 */
export function applyThemeToRoot(theme: LoomTheme | undefined, root: HTMLElement = document.documentElement): void {
  for (const k of BASE_COLOR_NAMES) {
    const v = theme?.[k];
    if (v) root.style.setProperty(`--bt-${k}`, v);
    else root.style.removeProperty(`--bt-${k}`);
  }
}
