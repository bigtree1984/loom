import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps, type InternalNode } from "@xyflow/react";

export interface LoomEdgeData extends Record<string, unknown> {
  active?: boolean;
  color: string;
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

  const scaleX = dx !== 0 ? w2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? h2 / Math.abs(dy) : Infinity;
  const t = Math.min(scaleX, scaleY);

  return { x: cx + dx * t, y: cy + dy * t };
}

/** Plain, arrow-less connector — the architecture graph is undirected, so
 * no end is marked as "in" or "out". Anchor points float on each node's
 * boundary along the line between the two node centers, rather than
 * snapping to a fixed handle. When active, a light travels back and forth
 * along the line instead of a one-way arrow. */
export function LoomArchEdge({ id, source, target, style, label, labelStyle, data }: EdgeProps) {
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
      <BaseEdge id={id} path={path} style={style} label={label} labelStyle={labelStyle} />
      {edgeData?.active && (
        <circle r={4} fill={edgeData.color}>
          <animateMotion
            dur="1.6s"
            repeatCount="indefinite"
            keyPoints="0;1;0"
            keyTimes="0;0.5;1"
            calcMode="linear"
            path={path}
          />
        </circle>
      )}
    </>
  );
}
