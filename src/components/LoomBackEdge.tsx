import { BaseEdge, type EdgeProps } from "@xyflow/react";

const DETOUR_OFFSET = 140;
const LEG = 40;

/** Loop-back connections (a cycle in the flow graph, e.g. a human-gate
 * rejection routing back to an earlier task) bow out to the right instead
 * of cutting straight back through the intervening nodes. The path exits
 * straight down from the source and enters straight down into the target,
 * so it's unambiguous which end is which. */
export function LoomBackEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  style,
  markerEnd,
  label,
  labelStyle,
  id,
}: EdgeProps) {
  const bowX = Math.max(sourceX, targetX) + DETOUR_OFFSET;
  const midY = (sourceY + targetY) / 2;
  const path = [
    `M ${sourceX},${sourceY}`,
    `C ${sourceX},${sourceY + LEG} ${bowX},${sourceY} ${bowX},${midY}`,
    `C ${bowX},${targetY} ${targetX},${targetY - LEG} ${targetX},${targetY}`,
  ].join(" ");

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} label={label} labelStyle={labelStyle} />;
}
