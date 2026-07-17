import { Handle, Position, type NodeProps } from "@xyflow/react";

const HANDLE_STYLE: React.CSSProperties = { opacity: 0, pointerEvents: "none" };

export interface LoomArchNodeData extends Record<string, unknown> {
  label: string;
  /** Category dot color (CSS var), always shown regardless of highlight state. */
  dotColor: string;
  /** Downloaded icon URL, or undefined if none is registered for this node yet. */
  iconUrl?: string;
}

/**
 * The actual on-screen connection point is computed by LoomArchEdge as a
 * floating intersection with this node's boundary — these two handles
 * just satisfy React Flow's bookkeeping (every edge needs a valid
 * source/target handle to resolve), their declared position doesn't
 * affect where the line is drawn.
 *
 * Layout: icon (if present) on top, category dot + label below. Without
 * an icon, the dot + label sit alone, vertically centered in the same box
 * height so nodes don't jump in size across a diagram.
 */
export function LoomArchNode({ data }: NodeProps) {
  const d = data as LoomArchNodeData;
  return (
    <>
      <Handle type="target" position={Position.Top} style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} style={HANDLE_STYLE} />
      <div className="loom-arch-node-content">
        {d.iconUrl && <img src={d.iconUrl} alt="" className="loom-arch-node-icon" />}
        <div className="loom-arch-node-row">
          <span className="loom-arch-node-dot" style={{ background: d.dotColor }} />
          <span className="loom-arch-node-label">{d.label}</span>
        </div>
      </div>
    </>
  );
}
