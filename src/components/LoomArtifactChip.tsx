import type { NodeProps } from "@xyflow/react";

export interface LoomArtifactChipData extends Record<string, unknown> {
  label: string;
  /** Touched by the current step: drawn in the route colour. */
  active?: boolean;
  color?: string;
  /** Born in the current step: fades/scales in. */
  born?: boolean;
  /** Used up: kept mounted (so it can fade) but invisible. */
  hidden?: boolean;
  /** Flying copy / signal: offset it starts from, relative to where it lands. */
  ghost?: { dx: number; dy: number };
  /** Changes every step so CSS entry animations replay. */
  stepKey: string;
}

/** An artifact on a node (v3). Movement between nodes is the React Flow
 * node's own transform, animated by a CSS transition (styles.css). */
export function LoomArtifactChip({ data }: NodeProps) {
  const d = data as LoomArtifactChipData;
  const cls = [
    "loom-artifact-chip",
    d.active && "is-active",
    d.born && "is-born",
    d.hidden && "is-hidden",
    d.ghost && "is-ghost",
  ]
    .filter(Boolean)
    .join(" ");
  const style = {
    ...(d.color ? { "--chip-color": d.color } : {}),
    ...(d.ghost ? { "--dx": `${d.ghost.dx}px`, "--dy": `${d.ghost.dy}px` } : {}),
  } as React.CSSProperties;
  return (
    <div key={d.stepKey} className={cls} style={style} title={d.label}>
      <span className="loom-artifact-chip-mark" aria-hidden />
      <span className="loom-artifact-chip-label">{d.label}</span>
    </div>
  );
}
