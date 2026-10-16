import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, Controls, ReactFlow, useNodesState, useReactFlow, type Edge, type FinalConnectionState, type Node, type NodeChange } from "@xyflow/react";
import { LoomArchEdge } from "./LoomArchEdge";
import { LoomArchNode } from "./LoomArchNode";
import { LoomLaneHeader, type LoomLaneHeaderData } from "./LoomLaneHeader";
import type { LaneHeader, LaneTile } from "../graph/toArchitectureFlow";
import { LoomLaneTile, type LoomLaneTileData } from "./LoomLaneTile";
import { geometryFor, HEADER_Y } from "../graph/gridGeometry";
import type { ArchLayout } from "../types";

const edgeTypes = { loomEdge: LoomArchEdge };
const nodeTypes = { loomArchNode: LoomArchNode, loomLaneHeader: LoomLaneHeader, loomLaneTile: LoomLaneTile };


/** Re-fits the viewport after a grid <-> hex toggle (positions change, so
 * the old viewport can cut the diagram off). Waits two frames so the new
 * node positions/measurements from setRfNodes are in the store first. */
function FitOnLayoutChange({ layout }: { layout: ArchLayout }) {
  const { fitView } = useReactFlow();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => void fitView({ padding: 0.2, duration: 200 }));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [layout, fitView]);
  return null;
}

interface Props {
  nodes: Node[];
  edges: Edge[];
  laneHeaders: LaneHeader[];
  tiles: LaneTile[];
  onSwapLanes: (index: number) => void;
  /** Drag-and-drop lane reorder: column `from` ends up at index `to`. */
  onMoveLane: (from: number, to: number) => void;
  onNodeDragEnd: (nodeId: string, position: { x: number; y: number }) => void;
  /** Edge drawn by dragging from one node's grab point onto another. */
  onConnectNodes: (from: string, to: string) => void;
  onDeleteEdge: (index: number) => void;
  onReverseEdge: (index: number) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onAddNode: () => void;
  onGroupDoubleClick: (groupId: string) => void;
  onAddGroup: () => void;
  layout: ArchLayout;
  onRelayout: () => void;
  onToggleLayout: () => void;
  /** Present mode: no editing affordances, nodes fixed in place. */
  readOnly?: boolean;
  /** Picking nodes for the task editor: clicks toggle, editing is paused. */
  picking?: { selected: Set<string>; onPick: (nodeId: string) => void } | null;
}

export function ArchitecturePanel({
  nodes,
  edges,
  laneHeaders,
  tiles,
  onSwapLanes,
  onMoveLane,
  onNodeDragEnd,
  onConnectNodes,
  onDeleteEdge,
  onReverseEdge,
  onNodeDoubleClick,
  onAddNode,
  onGroupDoubleClick,
  onAddGroup,
  layout,
  onRelayout,
  onToggleLayout,
  readOnly: readOnlyProp = false,
  picking = null,
}: Props) {
  const readOnly = readOnlyProp || !!picking;
  const geometry = useMemo(() => geometryFor(layout), [layout]);
  const headerWidth = geometry.nodeW;
  const { screenToFlowPosition } = useReactFlow();

  // Lane drag: `gap` is the insertion slot (0 = before the first column,
  // n = after the last), shown as a vertical marker while dragging.
  const [laneDrag, setLaneDrag] = useState<{ from: number; gap: number } | null>(null);
  const laneCount = laneHeaders.length;
  const startLaneDrag = useCallback(
    (from: number, e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX;
      let active = false;
      let gap = from;
      const gapAt = (clientX: number, clientY: number) => {
        const { x } = screenToFlowPosition({ x: clientX, y: clientY });
        const g = geometry.pitchX - geometry.nodeW;
        return Math.min(laneCount, Math.max(0, Math.round((x + g / 2) / geometry.pitchX)));
      };
      const move = (ev: PointerEvent) => {
        if (!active && Math.abs(ev.clientX - startX) < 5) return;
        active = true;
        gap = gapAt(ev.clientX, ev.clientY);
        setLaneDrag({ from, gap });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setLaneDrag(null);
        if (!active) return;
        const to = gap > from ? gap - 1 : gap;
        if (to !== from) onMoveLane(from, to);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [screenToFlowPosition, geometry, laneCount, onMoveLane],
  );
  const [rfNodes, setRfNodes, onNodesChangeBase] = useNodesState(nodes);

  // Only an id the user has actually dragged keeps its position across a
  // node-list regeneration (e.g. highlight colors changing every step).
  // Matching purely by id previously kept a *stale* position for any node
  // that merely shared an id with one from a *different* document (e.g.
  // "gcs" appearing in two unrelated samples) — this narrows "preserve
  // position" to nodes genuinely moved by this user, in this session.
  const draggedIds = useRef(new Set<string>());

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      changes.forEach((c) => {
        if (c.type !== "position") return;
        if (c.dragging) {
          draggedIds.current.add(c.id);
        } else if (draggedIds.current.has(c.id) && c.position) {
          // The final change for a drag (dragging just went false) — snap
          // it to the nearest lane/row and let the caller persist that.
          // Un-mark it as "dragged" so the freeform pixel position it was
          // just dropped at doesn't win over the snapped position the
          // resulting doc update computes.
          draggedIds.current.delete(c.id);
          onNodeDragEnd(c.id, c.position);
        }
      });
      onNodesChangeBase(changes);
    },
    [onNodesChangeBase, onNodeDragEnd],
  );

  useEffect(() => {
    setRfNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return nodes.map((n) => {
        const existing = draggedIds.current.has(n.id) ? byId.get(n.id) : undefined;
        return existing ? { ...n, position: existing.position } : n;
      });
    });
  }, [nodes, setRfNodes]);

  // Lane headers are real React Flow nodes (not an HTML overlay) so they
  // pan/zoom in lock-step with the lane they label, positioned above row 0.
  // Not draggable/connectable/selectable, and rebuilt fresh every render —
  // no drag-position bookkeeping needed for them.
  const headerNodes: Node[] = useMemo(
    () =>
      laneHeaders.map((h, i) => {
        const data: LoomLaneHeaderData = {
          label: h.label,
          readOnly,
          canMoveLeft: i > 0,
          canMoveRight: i < laneHeaders.length - 1,
          onMoveLeft: () => onSwapLanes(i - 1),
          onMoveRight: () => onSwapLanes(i),
          onDragStart: (e) => startLaneDrag(i, e),
          dragging: laneDrag?.from === i,
        };
        return {
          id: `lane-header-${h.col}`,
          type: "loomLaneHeader",
          position: { x: h.x, y: HEADER_Y },
          data,
          draggable: false,
          selectable: false,
          connectable: false,
          // React Flow disables pointer-events on a node's wrapper entirely
          // when it's non-draggable/non-selectable/non-connectable with no
          // node-level handlers — correct for a purely decorative node, but
          // this one has real interactive buttons inside it, so it must be
          // forced back on or every click passes through to the pane below.
          style: { width: headerWidth, pointerEvents: "auto" },
        };
      }),
    [laneHeaders, onSwapLanes, headerWidth, readOnly, startLaneDrag, laneDrag],
  );

  // Edge editing: click selects, Delete/Backspace removes, right-click flips.
  const [selectedEdge, setSelectedEdge] = useState<number | null>(null);
  useEffect(() => setSelectedEdge(null), [edges.length]);
  useEffect(() => {
    if (selectedEdge === null) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteEdge(selectedEdge);
        setSelectedEdge(null);
      } else if (e.key === "Escape") setSelectedEdge(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedEdge, onDeleteEdge]);
  const edgeIndexOf = (edge: Edge) => Number(edge.id.split("-")[2]);
  const shownEdges = useMemo(
    () =>
      selectedEdge === null
        ? edges
        : edges.map((e) =>
            edgeIndexOf(e) === selectedEdge ? { ...e, style: { ...e.style, strokeWidth: 3.5, strokeDasharray: "6 3" } } : e,
          ),
    [edges, selectedEdge],
  );

  // Dropped anywhere on a node body counts, not just on its (hidden)
  // target handle — find the node under the pointer ourselves.
  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: FinalConnectionState) => {
      const from = state.fromNode?.id;
      if (!from) return;
      let to = state.toNode?.id;
      if (!to) {
        const p = "changedTouches" in event ? event.changedTouches[0] : event;
        const el = document.elementFromPoint(p.clientX, p.clientY)?.closest(".react-flow__node");
        to = el?.getAttribute("data-id") ?? undefined;
      }
      if (to && !to.startsWith("lane-") && to !== from) onConnectNodes(from, to);
    },
    [onConnectNodes],
  );

  const pickNodes = useMemo(
    () =>
      picking
        ? rfNodes.map((n) => ({
            ...n,
            className: [
              "loom-pickable",
              picking.selected.has(n.id) && "loom-picked",
              picking.selected.has(n.id) && layout === "hex" && "loom-picked-hex",
            ]
              .filter(Boolean)
              .join(" "),
          }))
        : rfNodes,
    [rfNodes, picking, layout],
  );

  const dropMarker: Node[] = useMemo(() => {
    if (!laneDrag) return [];
    const top = HEADER_Y - 24;
    const bottom = Math.max(0, ...tiles.map((t) => t.y + t.h));
    const x = laneDrag.gap * geometry.pitchX - (geometry.pitchX - geometry.nodeW) / 2 - 2;
    return [
      {
        id: "lane-drop-marker",
        type: "loomLaneTile",
        position: { x, y: top },
        data: { shape: "rect", odd: false, marker: true },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        zIndex: 10,
        style: { width: 4, height: bottom - top, pointerEvents: "none", padding: 0, border: "none", background: "transparent" },
      },
    ];
  }, [laneDrag, tiles, geometry]);

  const tileNodes: Node[] = useMemo(
    () =>
      tiles.map((t) => {
        const data: LoomLaneTileData = { shape: layout === "hex" && !t.kind ? "hex" : "rect", odd: t.col % 2 === 1 };
        return {
          id: t.kind ? `lane-band-${t.col}` : `lane-tile-${t.col}-${t.row}`,
          type: "loomLaneTile",
          position: { x: t.x, y: t.y },
          data,
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          zIndex: -1,
          style: { width: t.w, height: t.h, pointerEvents: "none", padding: 0, border: "none", background: "transparent" },
        };
      }),
    [tiles, layout],
  );

  return (
    <div className={`panel architecture-panel${picking ? " picking" : ""}`}>
      <div className="panel-header">
        <div className="panel-title">アーキテクチャ(空間)</div>
        {!readOnly && selectedEdge !== null && (
          <div className="panel-hint">選択中の線: Deleteで削除 / 右クリックで向きを反転 / Escで解除</div>
        )}
        {!readOnly && (
          <div className="panel-header-actions">
            <button onClick={onToggleLayout}>{layout === "grid" ? "ハニカム表示" : "グリッド表示"}</button>
            <button onClick={onRelayout}>整列し直す</button>
            <button onClick={onAddGroup}>+列追加</button>
            <button onClick={onAddNode}>+ノード追加</button>
          </div>
        )}
      </div>
      <div className="rf-container">
        <ReactFlow
          nodes={[...tileNodes, ...headerNodes, ...pickNodes, ...dropMarker]}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => {
            if (picking && node.type === "loomArchNode") picking.onPick(node.id);
          }}
          onNodeDoubleClick={(_, node) => {
            if (readOnly) return;
            if (node.type === "loomLaneHeader") {
              const col = Number(node.id.slice("lane-header-".length));
              const header = laneHeaders[col];
              if (header) onGroupDoubleClick(header.id);
              return;
            }
            onNodeDoubleClick(node.id);
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={!readOnly}
          zoomOnDoubleClick={false}
          nodesConnectable={!readOnly}
          onConnectEnd={readOnly ? undefined : handleConnectEnd}
          connectionLineStyle={{ stroke: "var(--loom-c1)", strokeWidth: 2 }}
          onEdgeClick={(_, edge) => !readOnly && setSelectedEdge(edgeIndexOf(edge))}
          onEdgeContextMenu={(e, edge) => {
            if (readOnly) return;
            e.preventDefault();
            onReverseEdge(edgeIndexOf(edge));
          }}
          onPaneClick={() => setSelectedEdge(null)}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <FitOnLayoutChange layout={layout} />
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
