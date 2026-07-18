export type ArchNodeType = "human" | "frontend" | "backend" | "agent" | "storage";

/** Fixed 5-color dot palette (CSS-variable backed) used to mark a node's
 * category at a glance, independent of its highlight state. */
export type ArchNodeColorToken = "color_1" | "color_2" | "color_3" | "color_4" | "color_5";

export interface ArchNode {
  id: string;
  label: string;
  type: ArchNodeType;
  group?: string;
  /** Dot color; falls back to a type-based default when omitted. */
  colorToken?: ArchNodeColorToken;
  /** Key into the icon registry (src/assets/icons/{icon}.svg), e.g. "aws-s3". */
  icon?: string;
  /**
   * Pins this node to a specific row (0 = top) within its lane, instead of
   * the automatic ordering (pipeline step order, or the average position
   * of whichever neighbors already have one). Other nodes in the same
   * lane without a rowOrder fill the remaining rows around it — this
   * can't reintroduce overlaps because rows are still discrete slots, not
   * free pixel coordinates.
   */
  rowOrder?: number;
}

/**
 * Undirected — `a`/`b` carries no visual meaning (no arrowheads), it's
 * only used as a layout hint for ranking the architecture diagram
 * left-to-right.
 */
export interface ArchEdge {
  a: string;
  b: string;
  label?: string;
}

export interface ArchGroup {
  id: string;
  label: string;
}

export interface Task {
  id: string;
  label: string;
  description: string;
  /** architecture node id this task executes on */
  mainNode: string;
  /** architecture node ids providing input */
  inputNodes: string[];
  /** architecture node ids receiving output */
  outputNodes: string[];
}

/**
 * A connection's shape alone determines flow semantics — no separate
 * fields for branch/fork/join/loop-back are needed:
 *  - one outgoing, no label            -> linear
 *  - 2+ outgoing, all labeled          -> decision (labels become choice buttons)
 *  - 2+ outgoing, no label             -> parallel fork (all targets active at once)
 *  - 2+ incoming into the same task    -> join (waits for every active branch)
 *  - `to` pointing at an earlier task  -> loop-back
 * A task is a human gate purely because its `mainNode` resolves to an
 * architecture node with type "human" — again, no separate field.
 */
export interface Connection {
  from: string;
  to: string;
  label?: string;
}

export interface LoomDocument {
  architecture: {
    nodes: ArchNode[];
    edges: ArchEdge[];
    groups?: ArchGroup[];
    /**
     * Explicit left-to-right lane order, as an escape hatch over the
     * automatic ordering (which minimizes edges that jump across
     * multiple lanes). Entries are lane keys: a group id for a grouped
     * lane, `"__human__"` for the human lane, or `"__type_{type}"`
     * (e.g. `"__type_agent"`) for the fallback lane of ungrouped nodes
     * of that type. Lanes present in the diagram but missing from this
     * list are appended after it, so a partial override is safe.
     * Normally written by the lane-swap UI, not hand-authored.
     */
    laneOrder?: string[];
  };
  flow: {
    tasks: Task[];
    connections: Connection[];
  };
}
