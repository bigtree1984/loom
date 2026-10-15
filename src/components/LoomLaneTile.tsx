import type { NodeProps } from "@xyflow/react";

export interface LoomLaneTileData extends Record<string, unknown> {
  shape: "rect" | "hex";
  /** Column parity: even columns use --loom-lane-a, odd --loom-lane-b. */
  odd: boolean;
}

/** Same pointy-top outline as LoomArchNode's hex, in a 0..100 viewBox. */
const HEX_POINTS = "50,0 100,25 100,75 50,100 0,75 0,25";

/**
 * Background tile for one grid cell, tinted by column so a column stays
 * readable as one lane even when hex rows zig-zag. Purely decorative —
 * the node wrapper gets pointer-events: none so drags and clicks pass
 * through to the pane / real nodes.
 */
export function LoomLaneTile({ data }: NodeProps) {
  const d = data as LoomLaneTileData;
  const fill = d.odd ? "var(--loom-lane-b)" : "var(--loom-lane-a)";
  if (d.shape === "rect") return <div style={{ width: "100%", height: "100%", background: fill }} />;
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
      <polygon points={HEX_POINTS} fill={fill} />
    </svg>
  );
}
