# Loom — AI agent guide

Loom pairs a process-flow diagram (time) with an architecture diagram
(space): step through the flow and the architecture diagram highlights
whichever nodes the current task touches. This page documents the data
format and the URL sharing scheme so an agent can generate a working
`LoomDocument` and hand a human a link to it, without needing to read the
source.

The same information also lives in the source repo
(https://github.com/bigtree1984/loom) as `src/types.ts` — this page exists
so it's reachable from the deployed app itself, not only from GitHub.

## LoomDocument shape

The `jsonc` code fences below use `//` comments only to annotate fields
for you, the reader. A real `LoomDocument` is strict JSON — no comments,
no trailing commas. Strip any comments before saving or uploading a
document; a Loom document with `//` in it will fail to parse.

```jsonc
{
  "version": 2,
  "architecture": {
    "layout": "grid",              // optional — "grid" (default) | "hex" (honeycomb)
    "columns": [ /* ArchColumn[] */ ],
    "nodes": [ /* ArchNode[] */ ],
    "edges": [ /* ArchEdge[] */ ]
  },
  "flow": {
    "tasks": [ /* Task[] */ ],
    "connections": [ /* Connection[] */ ]
  }
}
```

The architecture diagram is a grid of cells. Each node sits in one cell
(`col`, `row`); `columns` gives the column headers left to right. **You
don't have to compute cells**: give nodes a `group` (a column id) and
leave `col`/`row` out, and Loom lays them out automatically the first time
the document is opened (see "Placement").

### ArchColumn

```jsonc
{ "id": "storage", "label": "データ保存先" }
```

Index in `columns` = the column's position (0 = leftmost).

### ArchNode

```jsonc
{
  "id": "gcs",                 // unique, referenced by edges/tasks
  "label": "GCS\n(画像・音声・動画)", // "\n" makes a second line
  "type": "storage",           // "human" | "frontend" | "backend" | "agent" | "storage"
  "group": "storage",          // optional — the column id to place it in (see "Placement")
  "col": 2, "row": 0,          // optional — exact cell; omit to let Loom place it
  "colorToken": "color_4",     // optional — "color_1".."color_5", the category dot's color.
                                // Omit to fall back to a type-based default.
  "icon": "gcp-cloud-storage"  // optional — key into the icon registry (see "Icons")
}
```

A `human` node is an ordinary node; when it has no `group`, automatic
placement puts it in its own column.

### ArchEdge

Directed `from` → `to`: an arrowhead is drawn at `to`. Set
`"bidirectional": true` to also draw one at `from`.

```jsonc
{ "from": "api", "to": "gemini_tts", "label": "音声生成を依頼" }
{ "from": "app", "to": "db", "bidirectional": true }
```

### Task

```jsonc
{
  "id": "t5",
  "label": "音声を生成",
  "description": "台本のセリフをTTSサービスで音声ファイルに変換し、ストレージへ保存する。",
  "mainNode": "script_generator",     // architecture node id this task executes on
  "inputNodes": ["database"],         // architecture node ids it reads from
  "outputNodes": ["tts_service", "storage"] // architecture node ids it writes to / calls
}
```

`inputNodes` and `outputNodes` are required — if a task has none, write
`[]` rather than omitting the field. (In practice a missing field is
tolerated too: the app fills it in as `[]`, but don't rely on that when
hand- or LLM-authoring a document.)

A task is a human gate purely because its `mainNode` resolves to an
architecture node with `type: "human"` — there's no separate flag.

### Connection

A connection's shape alone determines flow semantics — no separate
fields for branch/fork/join/loop-back:

- one outgoing, no label → linear
- 2+ outgoing, all labeled → decision (labels become choice buttons in the UI)
- 2+ outgoing, no label → parallel fork (all targets become active at once)
- 2+ incoming into the same task → join (waits for every active branch)
- `to` pointing at an earlier task → loop-back (rendered as a dashed curve)

For a decision, each labeled branch needs its own distinct `to` — two
labels pointing at the same task collapse into one indistinguishable
choice (whichever the user picks, the flow ends up in the same place). A
full two-branch decision, one branch continuing forward and the other
looping back:

```jsonc
{ "from": "t9", "to": "t10", "label": "テスト成功:デプロイへ進む" },
{ "from": "t9", "to": "t5", "label": "テスト失敗:実装へ差し戻し" }
```

## Placement

- **Nothing placed yet** (no node has `col`/`row` — the normal case for a
  generated document): Loom groups nodes into columns by `group` (or by
  `type` when ungrouped), orders the columns to keep connected columns
  next to each other, orders each column by pipeline step, and writes the
  result into `col`/`row`. After that the cells are fixed — the user's
  drags and column swaps are never recomputed away.
- **Mostly placed** (some nodes have cells): nodes without a cell go into
  the first free row of their `group` column, or a new column at the right
  if they have none.
- Two nodes on one cell: the later one moves down to the next free row.
- Empty cells are simply blank space; there is no placeholder node.

## Older (v1) documents

Documents written for the previous format still load and are converted
once: `groups` → `columns`, `laneOrder` → column order, `group` /
`rowOrder` → `col` / `row`, `spacer` nodes are dropped, and edges
`a`/`b` become `from`/`to` (read as a → b). Everything Loom writes back
(share links, downloads) is v2.

## Icons

`icon` resolves against `src/assets/icons/{icon}.svg` in the deployed
build. Generic tech logos (`python`, `flask`, `react`, `postgresql`,
`github`, `docker`) plus official AWS/GCP/Azure architecture icons
(`aws-*`, `gcp-*`, `azure-*`) are bundled into the deployed app — see the
repo's `src/assets/icons/README.md` for the full list and naming
convention. The vendor icons are excluded from the git repo itself
(licensing terms permit using them in diagrams, not redistributing the
icon set as a standalone asset pack), so they won't show up if you
inspect the source on GitHub, only in the running app. A missing icon
key just falls back to the category dot + label — nothing breaks.

## Label length

Keep `label` short — around 10-12 characters per line for architecture
nodes (168px wide boxes), ~16 for task labels. Longer labels are
automatically truncated with "…" (full text still available via hover
tooltip on architecture nodes), but a diagram reads better when you keep
it concise at the source.

## Sharing a document without a server

A document round-trips entirely through the URL fragment — the part
after `#`, which browsers never send in HTTP requests — so a share link
never touches any server, which matters for confidential diagrams.

Format: `<origin>/#doc=<base64url(gzip(JSON.stringify(doc)))>`

To build one:

1. `JSON.stringify(doc)`
2. gzip-compress the UTF-8 bytes (e.g. the browser's native
   `CompressionStream("gzip")`, or Node's `zlib.gzipSync`)
3. base64-encode the compressed bytes, then make it URL-safe:
   `+` → `-`, `/` → `_`, strip trailing `=` padding
4. `https://loom-266225712251.asia-northeast1.run.app/#doc=<result>`

Opening that URL loads the document client-side; no request is made
carrying the document's contents. See `src/urlShare.ts` in the repo for
the exact implementation.
