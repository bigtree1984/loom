# Loom

Loom visualizes a system's static architecture side-by-side with its process
flow, and lets you step through the flow while the architecture diagram
highlights whichever nodes the current task touches.

- Left panel: process flow (tasks + connections, i.e. time)
- Right panel: architecture (nodes + edges, i.e. space) — nodes are laid out
  in lanes by `group`, colored by a permanent category dot, and highlighted
  via border strength/color as the current step's route
- Bottom bar: step controls (back / next / branch choice / auto-play) and the
  current task's detail

MIT licensed — see [LICENSE](./LICENSE).

## Run locally

```
npm install
npm run dev
```

Then open the printed local URL and either click "サンプルを読み込む" to load
the bundled sample scenario, or upload your own JSON file matching the
`LoomDocument` shape in `src/types.ts`.

## Data format

A Loom file has two top-level sections:

- `architecture.nodes` / `architecture.edges` (+ optional `groups`) — the
  static component map.
- `flow.tasks` / `flow.connections` — the ordered process. Each task names a
  `mainNode` plus the `inputNodes` / `outputNodes` it touches, so the
  architecture panel knows what to highlight when that task is active.

Branches, parallel forks/joins, human-gates, and loop-backs all fall out of
`connections` alone — see `src/types.ts` for the exact rules.

## Icons

An architecture node can optionally show an icon via `icon: "some-key"`,
resolved against SVGs in `src/assets/icons/`. Generic tech logos
(`python`, `flask`, `react`, `postgresql`, from
[simple-icons](https://simpleicons.org), MIT licensed) are included. Official
vendor icons (`aws-*`, `gcp-*`, `azure-*`) are **not** committed — their usage
terms permit building diagrams with them but discourage redistributing the
icon set itself as part of another tool. Download them yourself from the
vendor and drop them into `src/assets/icons/` following the naming convention
in [src/assets/icons/README.md](./src/assets/icons/README.md); a missing icon
just falls back to the category dot + label, so nothing breaks in the
meantime.

## Samples for manual upload

`samples/` holds JSON files meant to be picked via the "JSONをアップロード"
button rather than bundled into the app (that's what `src/sample-data/` is
for). When asked to visualize some other process with Loom, generate a
`LoomDocument` for it and drop it in here.
