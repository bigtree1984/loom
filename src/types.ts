/**
 * "spacer" only exists in v1 documents (a placeholder that reserved a row).
 * v2 grids have real empty cells, so normalizeLoomDocument drops spacers.
 */
export type ArchNodeType = "human" | "frontend" | "backend" | "agent" | "storage" | "spacer";

/** Fixed 5-color dot palette (CSS-variable backed) used to mark a node's
 * category at a glance, independent of its highlight state. */
export type ArchNodeColorToken = "color_1" | "color_2" | "color_3" | "color_4" | "color_5";

export type ArchLayout = "grid" | "hex";

export interface ArchNode {
  id: string;
  label: string;
  type: ArchNodeType;
  /** Grid cell. After normalizeLoomDocument every node has both. */
  col?: number;
  row?: number;
  /**
   * Input-only placement hint: a column id. Lets a hand- or LLM-authored
   * document say "this belongs in that column" without computing cells.
   * Consumed (and removed) by normalizeLoomDocument. v1 documents use the
   * same field for their lane, so it doubles as the migration path.
   */
  group?: string;
  /** @deprecated Accepted for old documents, ignored: the category dot was
   * removed (lane tint already groups nodes, and the dot reused the route
   * highlight hues). */
  colorToken?: ArchNodeColorToken;
  /** Key into the icon registry (src/assets/icons/{icon}.svg), e.g. "aws-s3". */
  icon?: string;
  /**
   * Optional separate cell for the note illustration view (no lanes there,
   * a fixed-width canvas). Unset = derived from the screen layout; see
   * src/graph/noteCells.ts. Never affects the normal diagram.
   */
  noteCol?: number;
  noteRow?: number;
  /** v1 only — row ordering hint inside a lane; consumed by normalize. */
  rowOrder?: number;
}

/** Directed from -> to (arrowhead at `to`). */
export interface ArchEdge {
  from: string;
  to: string;
  label?: string;
  /** Also draw an arrowhead at `from` (two-way relationship). */
  bidirectional?: boolean;
}

/** A column header. Index in `columns` = the column's `col`. */
export interface ArchColumn {
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

/**
 * Per-document colour overrides (#RRGGBB). Base names are the Bigtree Lab
 * palette roles; everything else (route highlights, lane tints, dark mode)
 * derives from them. `lanes` replaces the note figure's lane hues.
 */
export interface LoomTheme {
  dk1?: string;
  dk2?: string;
  lt1?: string;
  lt2?: string;
  accent1?: string;
  accent2?: string;
  accent3?: string;
  accent4?: string;
  accent5?: string;
  accent6?: string;
  lanes?: string[];
}

export interface LoomDocument {
  version?: 2;
  theme?: LoomTheme;
  architecture: {
    layout?: ArchLayout;
    columns: ArchColumn[];
    nodes: ArchNode[];
    edges: ArchEdge[];
  };
  flow: {
    tasks: Task[];
    connections: Connection[];
  };
}

/** Shape accepted on input (v1 or v2, possibly incomplete). */
export interface LoomDocumentInput {
  version?: number;
  theme?: unknown;
  architecture?: {
    layout?: ArchLayout;
    columns?: ArchColumn[];
    groups?: ArchColumn[];
    laneOrder?: string[];
    nodes?: ArchNode[];
    edges?: Array<Partial<ArchEdge> & { a?: string; b?: string }>;
  };
  flow?: Partial<LoomDocument["flow"]>;
}
