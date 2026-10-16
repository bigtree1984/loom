import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";

export interface LoomEdgeData extends Record<string, unknown> {
  active?: boolean;
  color: string;
  /** Direction the active dot travels relative to source -> target;
   * "both" shuttles back and forth. */
  flow?: "forward" | "backward" | "both";
  /** The edge's own architecture arrow (what the edit toolbar shows) —
   * markers may differ while the edge is live. */
  archDir?: "forward" | "both" | "none";
}

/** Where the ray from `intersectionNode`'s center toward `otherNode`'s
 * center first crosses `intersectionNode`'s rectangle boundary — a
 * continuous point anywhere on the perimeter, not just the four
 * side-midpoints. Whichever axis (x or y) needs less travel to reach the
 * edge of the rectangle is the one that determines the exit point. */
function getNodeIntersection(intersectionNode: InternalNode, otherNode: InternalNode) {
  const w2 = (intersectionNode.measured.width ?? 0) / 2;
  const h2 = (intersectionNode.measured.height ?? 0) / 2;
  const otherW2 = (otherNode.measured.width ?? 0) / 2;
  const otherH2 = (otherNode.measured.height ?? 0) / 2;

  const pos = intersectionNode.internals.positionAbsolute;
  const otherPos = otherNode.internals.positionAbsolute;

  const cx = pos.x + w2;
  const cy = pos.y + h2;
  const dx = otherPos.x + otherW2 - cx;
  const dy = otherPos.y + otherH2 - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  if ((intersectionNode.data as { shape?: string } | undefined)?.shape === "hex") {
    // Pointy-top hexagon inscribed in the box: vertical sides at x = ±w2
    // (for |y| <= h2/2), slanted sides satisfy 0.5|x|/w2 + |y|/h2 = 1.
    const tSide = dx !== 0 ? w2 / Math.abs(dx) : Infinity;
    const tSlant = 1 / ((0.5 * Math.abs(dx)) / w2 + Math.abs(dy) / h2);
    const t = Math.min(tSide, tSlant);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  const scaleX = dx !== 0 ? w2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? h2 / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);

  return { x: cx + dx * t, y: cy + dy * t };
}

/** Directed connector (arrowhead at target, plus source when bidirectional;
 * markers come from the edge's markerEnd/markerStart). Anchor points float on each node's
 * boundary along the line between the two node centers, rather than
 * snapping to a fixed handle. When active, a light travels back and forth
 * along the line instead of a one-way arrow. */
export function LoomArchEdge({ id, source, target, style, label, labelStyle, data, markerEnd, markerStart }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edgeData = data as LoomEdgeData | undefined;

  if (!sourceNode || !targetNode) return null;

  const sourcePoint = getNodeIntersection(sourceNode, targetNode);
  const targetPoint = getNodeIntersection(targetNode, sourceNode);

  const [path] = getStraightPath({
    sourceX: sourcePoint.x,
    sourceY: sourcePoint.y,
    targetX: targetPoint.x,
    targetY: targetPoint.y,
  });

  return (
    <>
      <BaseEdge id={id} path={path} style={style} label={label} labelStyle={labelStyle} markerEnd={markerEnd} markerStart={markerStart} />
      {edgeData?.active && (
        <circle r={4} fill={edgeData.color}>
          <animateMotion
            dur="1.6s"
            repeatCount="indefinite"
            // Flow source -> target, matching the arrowhead; only a
            // two-way edge shuttles back and forth.
            keyPoints={edgeData.flow === "both" ? "0;1;0" : edgeData.flow === "backward" ? "1;0" : "0;1"}
            keyTimes={edgeData.flow === "both" ? "0;0.5;1" : "0;1"}
            calcMode="linear"
            path={path}
          />
        </circle>
      )}
    </>
  );
}
