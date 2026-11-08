import type { LoomDocument } from "../types";
import { memberships, placeMembers } from "./lanes";

type Architecture = LoomDocument["architecture"];

/**
 * Presentation-only view of the architecture: lanes holding no node dropped
 * and the rest packed again, so no blank gap remains (DESIGN_v2 §13: each
 * tier closes up on its own). Never mutates input.
 */
export function compactForPresent(architecture: Architecture): Architecture {
  const members = memberships(architecture);
  const used = new Set([...members.values()].map((m) => m.lane));
  const columns = architecture.columns.filter((c) => used.has(c.id));
  return placeMembers(architecture, columns, members);
}
