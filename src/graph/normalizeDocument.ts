import type { ArchEdge, ArchGroup, ArchNode, LoomDocument, Task } from "../types";

/**
 * Fills in array fields the type system requires but that hand- or LLM-
 * authored JSON easily omits (e.g. a task with no inputNodes because it
 * has none, rather than an explicit `[]`). Every consumer downstream
 * assumes these arrays exist without checking — rejecting the document
 * outright would be pedantic when "missing" and "empty" mean the same
 * thing here, so this normalizes it once at the load boundary instead of
 * scattering `?? []` guards through every reader.
 */
export function normalizeLoomDocument(raw: LoomDocument): LoomDocument {
  return {
    architecture: {
      nodes: asArray<ArchNode>(raw.architecture?.nodes),
      edges: asArray<ArchEdge>(raw.architecture?.edges),
      groups: raw.architecture?.groups ? asArray<ArchGroup>(raw.architecture.groups) : undefined,
      laneOrder: raw.architecture?.laneOrder,
    },
    flow: {
      tasks: asArray<Task>(raw.flow?.tasks).map(normalizeTask),
      connections: asArray(raw.flow?.connections),
    },
  };
}

function normalizeTask(t: Task): Task {
  return {
    ...t,
    inputNodes: asArray(t.inputNodes),
    outputNodes: asArray(t.outputNodes),
  };
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
