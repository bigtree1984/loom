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
  "architecture": {
    "nodes": [ /* ArchNode[] */ ],
    "edges": [ /* ArchEdge[] */ ],
    "groups": [ /* ArchGroup[], optional */ ],
    "laneOrder": [ /* string[], optional — see "Lane order" below */ ]
  },
  "flow": {
    "tasks": [ /* Task[] */ ],
    "connections": [ /* Connection[] */ ]
  }
}
```

### ArchNode

```jsonc
{
  "id": "gcs",                 // unique, referenced by edges/tasks
  "label": "GCS\n(画像・音声・動画)", // "\n" makes a second line
  "type": "storage",           // "human" | "frontend" | "backend" | "agent" | "storage"
  "group": "storage",          // optional — which lane this node lives in (see "Lanes")
  "colorToken": "color_4",     // optional — "color_1".."color_5", the category dot's color.
                                // Omit to fall back to a type-based default.
  "icon": "gcp-cloud-storage", // optional — key into the icon registry (see "Icons")
  "rowOrder": 2                // optional — pins this node's row within its lane (see "Lanes")
}
```

`type: "human"` is special: the node is always placed in its own
dedicated lane regardless of `group`, since it represents the
actor/trigger rather than a pipeline stage.

### ArchEdge

Undirected — `a`/`b` carries no visual meaning (no arrowheads are drawn).
The order is only used as a weak layout hint.

```jsonc
{ "a": "script_21", "b": "gemini_tts", "label": "声を作らせる" }
```

### ArchGroup

```jsonc
{ "id": "storage", "label": "データ保存先" }
```

Declaring a group gives it a human-readable label shown as a lane header
in the UI. A node's `group` field must match a declared group's `id` to
land in that lane — otherwise it falls back to a lane keyed by its `type`.

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

## Lanes

The architecture diagram lays nodes out in vertical lanes (columns).
Column membership comes from `group` (or `type` as a fallback for
ungrouped nodes); row position within a lane comes from pipeline step
order, or `rowOrder` when explicitly pinned.

**Lane order** (left to right) is chosen automatically to minimize the
number of edges that have to cross multiple lanes (a small Minimum
Linear Arrangement over lanes — cheap since there are only ever a
handful of lanes, even though the general problem is NP-hard). Set
`architecture.laneOrder` to override this explicitly:

```jsonc
"laneOrder": ["__human__", "frontend", "backend", "storage"]
```

Entries are lane keys: a group id for a grouped lane, `"__human__"` for
the human lane, or `"__type_{type}"` (e.g. `"__type_agent"`) for the
fallback lane of ungrouped nodes of that type. Lanes present in the
diagram but missing from the list are appended after it, so a partial
override is safe. This field is normally written by the in-app lane-swap
buttons, not hand-authored — but it's plain JSON, so an agent can set it
too.

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
