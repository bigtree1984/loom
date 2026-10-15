import { describe, expect, it } from "vitest";
import { cellToPixel, pixelToCell } from "../gridGeometry";
import type { ArchLayout } from "../../types";

describe.each<ArchLayout>(["grid", "hex"])("%s geometry", (layout) => {
  it("round-trips every cell", () => {
    for (let col = 0; col < 6; col++)
      for (let row = 0; row < 6; row++) {
        const { x, y } = cellToPixel(col, row, layout);
        expect(pixelToCell(x, y, layout)).toEqual({ col, row });
      }
  });
  it("snaps a slightly-off drop to the nearest cell", () => {
    const { x, y } = cellToPixel(3, 2, layout);
    expect(pixelToCell(x + 20, y - 15, layout)).toEqual({ col: 3, row: 2 });
  });
  it("clamps negative drops to the origin cell", () => {
    expect(pixelToCell(-500, -500, layout)).toEqual({ col: 0, row: 0 });
  });
});

it("hex shifts odd rows half a pitch right", () => {
  const even = cellToPixel(0, 0, "hex");
  const odd = cellToPixel(0, 1, "hex");
  const nextCol = cellToPixel(1, 0, "hex");
  expect(odd.x - even.x).toBeCloseTo((nextCol.x - even.x) / 2);
});

import { laneTileRect } from "../gridGeometry";

it("grid lane tiles abut horizontally and vertically", () => {
  const a = laneTileRect(0, 0, "grid");
  expect(laneTileRect(1, 0, "grid").x).toBeCloseTo(a.x + a.w);
  expect(laneTileRect(0, 1, "grid").y).toBeCloseTo(a.y + a.h);
});

it("hex lane tiles interlock: next row starts 3/4 of a tile lower, half a tile over", () => {
  const a = laneTileRect(0, 0, "hex");
  const b = laneTileRect(0, 1, "hex");
  expect(b.y - a.y).toBeCloseTo(a.h * 0.75);
  expect(b.x - a.x).toBeCloseTo(a.w / 2);
  expect(laneTileRect(1, 0, "hex").x).toBeCloseTo(a.x + a.w);
});
