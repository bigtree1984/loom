import { describe, expect, it } from "vitest";
import {
  HUMAN_LANE,
  layoutByLanes,
  optimizeLaneOrder,
  snapPositionToLane,
  validLaneKeysFor,
  type LaneNode,
} from "../layout";

const opts = { width: 100, height: 40 };

describe("optimizeLaneOrder", () => {
  it("explicit order wins", () => {
    const edges = [{ a: "x", b: "y" }];
    const lanes = new Map([["x", "A"], ["y", "C"]]);
    expect(optimizeLaneOrder(["A", "B", "C"], edges, lanes, ["C", "B", "A"])).toEqual(["C", "B", "A"]);
  });
  it("partial explicit order appends the rest; unknown keys dropped", () => {
    expect(optimizeLaneOrder(["A", "B", "C"], [], new Map(), ["C", "Z"])).toEqual(["C", "A", "B"]);
  });
  it("minimizes cost on a small example", () => {
    // A<->C heavy, B<->D heavy; seed order A,B,C,D would put each pair 2 apart.
    const lanes = new Map([["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]]);
    const edges = [
      { a: "a", b: "c" },
      { a: "a", b: "c" },
      { a: "b", b: "d" },
      { a: "b", b: "d" },
    ];
    const order = optimizeLaneOrder(["A", "B", "C", "D"], edges, lanes);
    expect(Math.abs(order.indexOf("A") - order.indexOf("C"))).toBe(1);
    expect(Math.abs(order.indexOf("B") - order.indexOf("D"))).toBe(1);
  });
  it("returns single lane unchanged", () => {
    expect(optimizeLaneOrder(["A"], [], new Map())).toEqual(["A"]);
  });
  it("handles more than 8 lanes (heuristic path)", () => {
    const lanes = Array.from({ length: 10 }, (_, i) => `L${i}`);
    const ids = new Map(lanes.map((l) => [l.toLowerCase(), l]));
    const edges = lanes.slice(1).map((l, i) => ({ a: lanes[i].toLowerCase(), b: l.toLowerCase() }));
    const order = optimizeLaneOrder(lanes, edges, ids);
    expect([...order].sort()).toEqual([...lanes].sort());
  });
});

describe("layoutByLanes", () => {
  const nodes: LaneNode[] = [
    { id: "a", type: "backend", group: "g1" },
    { id: "b", type: "backend", group: "g1" },
    { id: "c", type: "storage", group: "g2" },
    { id: "d", type: "storage" },
    { id: "h", type: "human" },
    { id: "h2", type: "human", group: "g1" },
  ];
  const edges = [{ a: "a", b: "c" }, { a: "b", b: "d" }];

  it("never gives two nodes the same position", () => {
    const r = layoutByLanes(nodes, edges, ["g1", "g2"], new Map(), opts);
    const seen = new Set<string>();
    r.positions.forEach((p) => {
      const k = `${p.x},${p.y}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    });
    expect(r.positions.size).toBe(nodes.length);
  });

  it("keeps a declared empty group in laneOrder", () => {
    const r = layoutByLanes(nodes, edges, ["g1", "g2", "empty"], new Map(), opts);
    expect(r.laneOrder).toContain("empty");
    expect(r.laneX.has("empty")).toBe(true);
  });

  it("rowOrder pins order within a lane", () => {
    const ns: LaneNode[] = [
      { id: "a", type: "backend", group: "g", rowOrder: 5 },
      { id: "b", type: "backend", group: "g", rowOrder: 1 },
      { id: "c", type: "backend", group: "g", rowOrder: 3 },
    ];
    const r = layoutByLanes(ns, [], ["g"], new Map(), opts);
    const ys = ["b", "c", "a"].map((id) => r.positions.get(id)!.y);
    expect(ys).toEqual([...ys].sort((x, y) => x - y));
    expect(new Set(ys).size).toBe(3);
  });

  it("human node with explicit group lands in that lane; ungrouped goes to __human__", () => {
    const r = layoutByLanes(nodes, edges, ["g1", "g2"], new Map(), opts);
    expect(r.laneOrder).toContain(HUMAN_LANE);
    expect(r.positions.get("h2")!.x).toBe(r.laneX.get("g1"));
    expect(r.positions.get("h")!.x).toBe(r.laneX.get(HUMAN_LANE));
    expect(r.positions.get("h")!.x).not.toBe(r.positions.get("h2")!.x);
  });

  it("explicit lane order is honored", () => {
    const r = layoutByLanes(nodes, edges, ["g1", "g2"], new Map(), opts, ["g2", "g1"]);
    expect(r.laneOrder.slice(0, 2)).toEqual(["g2", "g1"]);
  });
});

describe("validLaneKeysFor", () => {
  const keys = [HUMAN_LANE, "g1", "__type_storage", "__type_backend"];
  it("human may use human lane and groups only", () => {
    expect(validLaneKeysFor("human", keys)).toEqual([HUMAN_LANE, "g1"]);
  });
  it("non-human excludes human lane and other types' fallback lanes", () => {
    expect(validLaneKeysFor("storage", keys)).toEqual(["g1", "__type_storage"]);
  });
});

describe("snapPositionToLane", () => {
  const laneX = new Map([["a", 0], ["b", 200]]);
  it("snaps to nearest lane and rounded row", () => {
    expect(snapPositionToLane({ x: 150, y: 130 }, ["a", "b"], laneX, 64)).toEqual({ laneKey: "b", rowOrder: 2 });
    expect(snapPositionToLane({ x: 20, y: -50 }, ["a", "b"], laneX, 64)).toEqual({ laneKey: "a", rowOrder: 0 });
  });
  it("handles zero row height", () => {
    expect(snapPositionToLane({ x: 0, y: 10 }, ["a"], laneX, 0).rowOrder).toBe(0);
  });
});
