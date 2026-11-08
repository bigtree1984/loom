import { useEffect, useRef } from "react";
import type { NodeProps } from "@xyflow/react";

/** One looping animation for the current step (DESIGN_v3: the step's
 * artifact changes replay while the step is shown). The step's actions
 * play one after another: each chip animates only inside its own window
 * [from, to] (fractions of the loop), so a copy arriving and a result
 * being born don't happen on top of each other. Offsets are relative to
 * where the chip finally sits. */
export type ChipAnim = (
  | {
      kind: "move";
      points: { dx: number; dy: number }[];
      fadeOut?: boolean;
      fadeIn?: boolean;
      fadeFrom?: number;
      keepStart?: boolean;
      /** Born before it travels: grows in place over [from, to], then rests
       * until the travel window opens. */
      appear?: { from: number; to: number };
      /** Used up by a transform after arriving: rests, then over [from, to]
       * shrinks away toward (dx, dy) (the result's spot). */
      exit?: { from: number; to: number; dx: number; dy: number };
    }
  | { kind: "born"; until?: number }
  | { kind: "ended" }
  /** Transformed in place: shown until `from`, then shrinks away toward
   * (dx, dy) by `to` while the result grows in. */
  | { kind: "morphOut"; dx: number; dy: number }
  | { kind: "collapse"; dx: number; dy: number }
) & { from: number; to: number; duration: number };

function keyframesFor(a: ChipAnim): Keyframe[] {
  const { from, to } = a;
  // A vanishing arrival travels within [from, fadeFrom], rests, then fades by `to`.
  const travelTo = a.kind === "move" && a.fadeFrom !== undefined ? a.fadeFrom : to;
  const span = travelTo - from;
  const at = (f: number) => from + span * f;
  if (a.kind === "born") {
    // Appear within the first action only when it is used up later.
    const at = (f: number) => from + (a.until !== undefined ? Math.min(span, a.until - from) : span) * f;
    return [
      { opacity: 0, transform: "scale(0.6)", offset: 0 },
      { opacity: 0, transform: "scale(0.6)", offset: from },
      { opacity: 1, transform: "scale(1)", offset: at(0.5) },
      ...(a.until !== undefined
        ? [
            { opacity: 1, transform: "scale(1)", offset: Math.max(at(0.5), a.until) },
            { opacity: 0, transform: "scale(1)", offset: Math.max(at(0.5), a.until) + 0.01 },
            { opacity: 0, transform: "scale(1)", offset: 1 },
          ]
        : [{ opacity: 1, transform: "scale(1)", offset: 1 }]),
    ];
  }
  if (a.kind === "collapse") {
    // Shown where it was until the window opens, then slides into the
    // "+N" chip (its final spot) and fades into it.
    const t0 = `translate(${a.dx}px, ${a.dy}px)`;
    return [
      { opacity: 1, transform: t0, offset: 0 },
      { opacity: 1, transform: t0, offset: from },
      { opacity: 0, transform: "translate(0, 0)", offset: to },
      { opacity: 0, transform: "translate(0, 0)", offset: 1 },
    ];
  }
  if (a.kind === "morphOut") {
    return [
      { opacity: 1, transform: "translate(0, 0) scale(1)", offset: 0 },
      { opacity: 1, transform: "translate(0, 0) scale(1)", offset: from },
      { opacity: 0, transform: `translate(${a.dx}px, ${a.dy}px) scale(0.6)`, offset: to },
      { opacity: 0, transform: `translate(${a.dx}px, ${a.dy}px) scale(0.6)`, offset: 1 },
    ];
  }
  if (a.kind === "ended") {
    return [
      { opacity: 1, offset: 0 },
      { opacity: 1, offset: from },
      { opacity: 0, offset: at(0.6) },
      { opacity: 0, offset: 1 },
    ];
  }
  // move: rest at the start until the window opens, travel the waypoints
  // at an even pace inside it, then rest at the end (or fade, for a flying
  // copy / signal that is gone on arrival).
  const pts = a.points.length ? a.points : [{ dx: 0, dy: 0 }];
  const t = (p: { dx: number; dy: number }) => `translate(${p.dx}px, ${p.dy}px)`;
  const startOpacity = a.fadeIn ? 0 : 1;
  // A copy / signal isn't there before it sets off; something real that is
  // used up on arrival (keepStart) is.
  const before = a.fadeOut && !a.keepStart ? 0 : startOpacity;
  const frames: Keyframe[] = [{ transform: t(pts[0]), opacity: before, offset: 0 }];
  if (a.appear) {
    const s0 = `${t(pts[0])} scale(0.6)`;
    frames[0] = { transform: s0, opacity: 0, offset: 0 };
    frames.push({ transform: s0, opacity: 0, offset: a.appear.from });
    frames.push({ transform: `${t(pts[0])} scale(1)`, opacity: 1, offset: a.appear.to });
    frames.push({ transform: `${t(pts[0])} scale(1)`, opacity: 1, offset: from });
  } else frames.push({ transform: t(pts[0]), opacity: before, offset: from });
  const hops = Math.max(1, pts.length - 1);
  // Constant speed: each waypoint is reached in proportion to the distance
  // travelled so far (not per hop).
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].dx - pts[i - 1].dx, pts[i].dy - pts[i - 1].dy));
  const total = cum[cum.length - 1];
  pts.forEach((p, i) =>
    frames.push({ transform: t(p), opacity: 1, offset: at((0.15 + 0.85 * (total ? cum[i] / total : i / hops)) * 0.85) }),
  );
  frames.push({ transform: "translate(0, 0)", opacity: 1, offset: at(0.85) });
  if (a.exit) {
    frames.push({ transform: "translate(0, 0) scale(1)", opacity: 1, offset: a.exit.from });
    frames.push({ transform: `translate(${a.exit.dx}px, ${a.exit.dy}px) scale(0.6)`, opacity: 0, offset: a.exit.to });
    frames.push({ transform: `translate(${a.exit.dx}px, ${a.exit.dy}px) scale(0.6)`, opacity: 0, offset: 1 });
    for (let i = 1; i < frames.length; i++) frames[i].offset = Math.max(frames[i].offset as number, frames[i - 1].offset as number);
    return frames;
  }
  if (a.fadeOut && a.fadeFrom !== undefined)
    frames.push({ transform: "translate(0, 0)", opacity: 1, offset: to - (to - a.fadeFrom) * 0.25 });
  frames.push({ transform: "translate(0, 0)", opacity: a.fadeOut ? 0 : 1, offset: to });
  frames.push({ transform: "translate(0, 0)", opacity: a.fadeOut ? 0 : 1, offset: 1 });
  // Offsets must not decrease.
  for (let i = 1; i < frames.length; i++) frames[i].offset = Math.max(frames[i].offset as number, frames[i - 1].offset as number);
  return frames;
}

export interface LoomArtifactChipData extends Record<string, unknown> {
  label: string;
  /** Touched by the current step: drawn in the route colour. */
  active?: boolean;
  color?: string;
  /** Used up before this step: kept mounted but invisible. */
  hidden?: boolean;
  anim?: ChipAnim;
  /** Drawn as a tool attached to its node. */
  tool?: boolean;
  /** Compact tool: icon only (label in the tooltip). */
  toolIcon?: boolean;
  /** "+N" chip standing in for collapsed artifacts. */
  more?: boolean;
  /** "+N": the labels folded into it (shown on hover). */
  items?: string[];
  /** Changes every step so the animation restarts. */
  stepKey: string;
}

/** An artifact on a node (v3). */
export function LoomArtifactChip({ data }: NodeProps) {
  const d = data as LoomArtifactChipData;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !d.anim || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const anim = el.animate(keyframesFor(d.anim), { duration: d.anim.duration, iterations: Infinity, easing: "linear" });
    return () => anim.cancel();
    // stepKey restarts the loop on every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.stepKey, d.anim]);

  const cls = [
    "loom-artifact-chip",
    d.tool && "is-tool",
    d.toolIcon && "is-tool-icon",
    d.more && "is-more",
    d.active && "is-active",
    d.hidden && "is-hidden",
  ].filter(Boolean).join(" ");
  const style = (d.color ? { "--chip-color": d.color } : {}) as React.CSSProperties;
  return (
    <div ref={ref} className={cls} style={style} title={d.items ? undefined : d.label}>
      {d.more ? null : d.tool || d.toolIcon ? (
        <svg className="loom-artifact-chip-tool" viewBox="0 0 24 24" aria-label="ツール">
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
        </svg>
      ) : (
        <span className="loom-artifact-chip-mark" aria-hidden />
      )}
      {!d.toolIcon && <span className="loom-artifact-chip-label">{d.label}</span>}
      {d.items && (
        <ul className="loom-artifact-more-list" aria-label="まとめて表示しているもの">
          {d.items.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
