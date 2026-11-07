import { useEffect, useRef } from "react";
import type { NodeProps } from "@xyflow/react";

/** One looping animation for the current step (DESIGN_v3: the step's
 * artifact changes replay while the step is shown). Offsets are relative
 * to where the chip finally sits. */
export type ChipAnim =
  | { kind: "move"; points: { dx: number; dy: number }[]; fadeOut?: boolean; fadeIn?: boolean }
  | { kind: "born" }
  | { kind: "ended" };

export interface LoomArtifactChipData extends Record<string, unknown> {
  label: string;
  /** Touched by the current step: drawn in the route colour. */
  active?: boolean;
  color?: string;
  /** Used up before this step: kept mounted but invisible. */
  hidden?: boolean;
  anim?: ChipAnim;
  /** Changes every step so the animation restarts. */
  stepKey: string;
}

const HOP_MS = 900;
const HOLD_MS = 900;

function keyframesFor(a: ChipAnim): { frames: Keyframe[]; duration: number } {
  if (a.kind === "born") {
    return {
      frames: [
        { opacity: 0, transform: "scale(0.6)", offset: 0 },
        { opacity: 1, transform: "scale(1)", offset: 0.4 },
        { opacity: 1, transform: "scale(1)", offset: 1 },
      ],
      duration: 1600,
    };
  }
  if (a.kind === "ended") {
    return {
      frames: [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.35 },
        { opacity: 0, offset: 0.7 },
        { opacity: 0, offset: 1 },
      ],
      duration: 1800,
    };
  }
  // move: travel the waypoints at an even pace, then rest (or fade, for a
  // flying copy / signal that is gone on arrival).
  const hops = Math.max(1, a.points.length - 1);
  const travel = hops * HOP_MS;
  const duration = travel + HOLD_MS;
  const frames: Keyframe[] = a.points.map((p, i) => ({
    transform: `translate(${p.dx}px, ${p.dy}px)`,
    opacity: 1,
    offset: ((i / hops) * travel) / duration,
  }));
  frames.push({ transform: "translate(0, 0)", opacity: a.fadeOut ? 0 : 1, offset: 1 });
  if (a.fadeOut) frames[0].opacity = 0.9;
  if (a.fadeIn) frames[0].opacity = 0;
  return { frames, duration };
}

/** An artifact on a node (v3). */
export function LoomArtifactChip({ data }: NodeProps) {
  const d = data as LoomArtifactChipData;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !d.anim || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const { frames, duration } = keyframesFor(d.anim);
    const anim = el.animate(frames, { duration, iterations: Infinity, easing: "ease-in-out" });
    return () => anim.cancel();
    // stepKey restarts the loop on every step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.stepKey, d.anim]);

  const cls = ["loom-artifact-chip", d.active && "is-active", d.hidden && "is-hidden"].filter(Boolean).join(" ");
  const style = (d.color ? { "--chip-color": d.color } : {}) as React.CSSProperties;
  return (
    <div ref={ref} className={cls} style={style} title={d.label}>
      <span className="loom-artifact-chip-mark" aria-hidden />
      <span className="loom-artifact-chip-label">{d.label}</span>
    </div>
  );
}
