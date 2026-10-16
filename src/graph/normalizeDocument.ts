import type { ArchColumn, ArchEdge, ArchNode, LoomDocument, LoomDocumentInput, Task } from "../types";
import { computeStableOrder, HUMAN_LANE, layoutByLanes } from "./layout";
import { sanitizeTheme } from "./theme";

/**
 * The single load boundary: accepts a v1 or v2 document (possibly missing
 * fields a hand- or LLM-authored file easily omits) and returns a complete
 * v2 document. Everything downstream assumes the v2 shape:
 *  - architecture.columns exists (v1 `groups` renamed)
 *  - every node has integer col/row, no group/rowOrder, no spacers
 *  - edges are from/to (v1 a/b read as a -> b)
 *  - task inputNodes/outputNodes exist
 *
 * Placement of nodes without a cell:
 *  - if no node has a cell yet (a v1 document, or a v2 one left to auto-
 *    layout), run the lane layout over everything once and freeze the
 *    result into cells — after this, layout never re-runs on its own, so a
 *    user's drag isn't silently undone;
 *  - otherwise (a mostly-placed document with a few new nodes), drop each
 *    unplaced node into the first free row of its `group` column, or a
 *    new column at the right if it has none.
 */
export function normalizeLoomDocument(raw: LoomDocumentInput | LoomDocument): LoomDocument {
  const input = raw as LoomDocumentInput;
  const arch = input.architecture ?? {};
  const flowIn = input.flow ?? {};

  const tasks = asArray<Task>(flowIn.tasks).map((t) => ({
    ...t,
    inputNodes: asArray<string>(t.inputNodes),
    outputNodes: asArray<string>(t.outputNodes),
  }));
  const connections = asArray<LoomDocument["flow"]["connections"][number]>(flowIn.connections);

  const nodesIn = asArray<ArchNode>(arch.nodes).filter((n) => n.type !== "spacer");
  const nodeIds = new Set(nodesIn.map((n) => n.id));

  const edges: ArchEdge[] = asArray<NonNullable<NonNullable<LoomDocumentInput["architecture"]>["edges"]>[number]>(
    arch.edges,
  )
    .map((e) => {
      const { a, b, from, to, ...rest } = e;
      return { ...rest, from: (from ?? a) as string, to: (to ?? b) as string };
    })
    .filter((e) => e.from && e.to);
  // v1 spacers could not legitimately be edge endpoints, but don't keep a
  // dangling edge if one was.
  const liveEdges = edges.filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to));

  let columns: ArchColumn[] = asArray<ArchColumn>(arch.columns ?? arch.groups).map((c) => ({ ...c }));
  let nodes: ArchNode[];

  const isPlaced = (n: ArchNode) => Number.isInteger(n.col) && Number.isInteger(n.row);

  if (!nodesIn.some(isPlaced)) {
    ({ columns, nodes } = autoLayout(nodesIn, liveEdges, columns, arch.laneOrder, tasks, connections));
  } else {
    ({ columns, nodes } = placeStragglers(nodesIn, columns));
  }

  nodes = resolveCollisions(nodes).map(sanitizeNoteCell);

  const theme = sanitizeTheme(input.theme);
  return {
    version: 2,
    ...(theme ? { theme } : {}),
    architecture: {
      layout: arch.layout === "hex" ? "hex" : "grid",
      columns,
      nodes,
      edges: liveEdges,
    },
    flow: { tasks, connections },
  };
}

/** Strips placement so the next normalize re-runs auto layout, keeping each
 * node's current column as its `group` hint (for the 整列し直す button). */
export function clearPlacement(doc: LoomDocument): LoomDocumentInput {
  return {
    ...doc,
    architecture: {
      ...doc.architecture,
      nodes: doc.architecture.nodes.map(({ col, row: _row, ...n }) => ({
        ...n,
        group: col !== undefined ? doc.architecture.columns[col]?.id : undefined,
      })),
    },
  };
}

const FALLBACK_LABEL: Record<string, string> = {
  [HUMAN_LANE]: "人間",
  __type_frontend: "フロントエンド",
  __type_backend: "バックエンド",
  __type_agent: "エージェント",
  __type_storage: "データ",
};

function autoLayout(
  nodesIn: ArchNode[],
  edges: ArchEdge[],
  declared: ArchColumn[],
  laneOrder: string[] | undefined,
  tasks: Task[],
  connections: LoomDocument["flow"]["connections"],
): { columns: ArchColumn[]; nodes: ArchNode[] } {
  // Same step-order signal the v1 renderer used to sort rows within a lane.
  const order = computeStableOrder(
    tasks.map((t) => t.id),
    connections.map((c) => ({ source: c.from, target: c.to })),
  );
  const taskOrderByNode = new Map<string, number>();
  tasks.forEach((t) => {
    const o = order.get(t.id);
    if (o === undefined) return;
    const prev = taskOrderByNode.get(t.mainNode);
    if (prev === undefined || o < prev) taskOrderByNode.set(t.mainNode, o);
  });

  const layout = layoutByLanes(
    nodesIn.map((n) => ({ id: n.id, type: n.type, group: n.group, rowOrder: n.rowOrder })),
    edges.map((e) => ({ a: e.from, b: e.to })),
    declared.map((c) => c.id),
    taskOrderByNode,
    { width: 1, height: 1 },
    laneOrder,
  );

  const declaredById = new Map(declared.map((c) => [c.id, c]));
  const columns: ArchColumn[] = layout.laneOrder.map((key) => {
    const d = declaredById.get(key);
    if (d) return d;
    // Synthetic v1 lanes (human / type fallback) become ordinary columns.
    return { id: key.replace(/^_+|_+$/g, ""), label: FALLBACK_LABEL[key] ?? key };
  });

  const nodes = nodesIn.map((n) => {
    const cell = layout.cells.get(n.id) ?? { col: 0, row: 0 };
    return stripHints({ ...n, col: cell.col, row: cell.row });
  });
  return { columns, nodes };
}

function placeStragglers(nodesIn: ArchNode[], declared: ArchColumn[]): { columns: ArchColumn[]; nodes: ArchNode[] } {
  const columns = [...declared];
  const taken = new Set<string>();
  nodesIn.forEach((n) => {
    if (Number.isInteger(n.col) && Number.isInteger(n.row)) taken.add(`${n.col},${n.row}`);
  });

  const nodes = nodesIn.map((n) => {
    if (Number.isInteger(n.col) && Number.isInteger(n.row)) return stripHints(n);
    let col = Number.isInteger(n.col) ? (n.col as number) : columns.findIndex((c) => c.id === n.group);
    if (col < 0) {
      col = Math.max(columns.length, ...nodesIn.filter((m) => Number.isInteger(m.col)).map((m) => (m.col as number) + 1));
    }
    let row = Number.isInteger(n.row) ? (n.row as number) : 0;
    while (taken.has(`${col},${row}`)) row++;
    taken.add(`${col},${row}`);
    return stripHints({ ...n, col, row });
  });
  return { columns, nodes };
}

/** Two nodes on one cell: keep the first, push later ones down to the next
 * free row of the same column. */
function resolveCollisions(nodes: ArchNode[]): ArchNode[] {
  const taken = new Set<string>();
  return nodes.map((n) => {
    let row = n.row as number;
    while (taken.has(`${n.col},${row}`)) row++;
    taken.add(`${n.col},${row}`);
    if (row !== n.row) console.warn(`[loom] node "${n.id}" overlapped another node; moved to row ${row}`);
    return row === n.row ? n : { ...n, row };
  });
}

/** Keep a note cell only if it's a pair of non-negative integers. */
function sanitizeNoteCell(n: ArchNode): ArchNode {
  const ok = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
  if (ok(n.noteCol) && ok(n.noteRow)) return n;
  if (n.noteCol === undefined && n.noteRow === undefined) return n;
  const { noteCol: _c, noteRow: _r, ...rest } = n;
  return rest;
}

function stripHints(n: ArchNode): ArchNode {
  const { group: _g, rowOrder: _r, ...rest } = n;
  return rest;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
