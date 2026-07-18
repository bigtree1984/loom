import type { NodeProps } from "@xyflow/react";

export interface LoomLaneHeaderData extends Record<string, unknown> {
  label: string;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onMoveLeft: () => void;
  onMoveRight: () => void;
}

/**
 * Rendered as an actual React Flow node (not an HTML overlay) so it pans
 * and zooms in lock-step with the lane it labels — an overlay positioned
 * in screen pixels would drift out of alignment the moment the user pans.
 */
export function LoomLaneHeader({ data }: NodeProps) {
  const d = data as LoomLaneHeaderData;
  return (
    // nodrag/nopan: without them, React Flow's own pointerdown handling
    // (drag-detection on the node, pane panning) swallows the mouse event
    // before a real click ever reaches the buttons — only synthetic
    // .click() calls worked without this, actual mouse clicks didn't.
    <div className="loom-lane-header nodrag nopan">
      <button
        className="loom-lane-header-arrow"
        disabled={!d.canMoveLeft}
        onClick={d.onMoveLeft}
        aria-label="左のレーンと入れ替え"
      >
        ◀
      </button>
      <span className="loom-lane-header-label">{d.label}</span>
      <button
        className="loom-lane-header-arrow"
        disabled={!d.canMoveRight}
        onClick={d.onMoveRight}
        aria-label="右のレーンと入れ替え"
      >
        ▶
      </button>
    </div>
  );
}
