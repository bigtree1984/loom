import { describe, expect, it } from "vitest";
import { BASE_COLORS, resolveBase, sanitizeTheme } from "../theme";
import { normalizeLoomDocument } from "../normalizeDocument";
import { notePalette } from "../../export/noteSpec";
import { renderNoteFigure } from "../../export/renderNoteSvg";

describe("theme overrides", () => {
  it("keeps only #RRGGBB values, uppercased; drops unknown keys and junk", () => {
    expect(sanitizeTheme({ accent1: "#aa0000", dk1: "red", foo: "#123456", lanes: ["#00ff00", 3, "nope"] })).toEqual({
      accent1: "#AA0000",
      lanes: ["#00FF00"],
    });
    expect(sanitizeTheme({ dk1: "#12345" })).toBeUndefined();
    expect(sanitizeTheme(null)).toBeUndefined();
  });

  it("falls back to the Bigtree base for anything not overridden", () => {
    const b = resolveBase({ accent1: "#AA0000" });
    expect(b.accent1).toBe("#AA0000");
    expect(b.dk1).toBe(BASE_COLORS.dk1);
  });

  it("survives normalize (so it travels in share links)", () => {
    const doc = normalizeLoomDocument({ theme: { accent6: "#123456", bogus: 1 }, architecture: { nodes: [] } });
    expect(doc.theme).toEqual({ accent6: "#123456" });
    expect(normalizeLoomDocument({ architecture: { nodes: [] } }).theme).toBeUndefined();
  });

  it("default note palette matches the pre-theme hardcoded values", () => {
    const p = notePalette();
    expect([p.bg, p.panel, p.border, p.text, p.textSub, p.edge]).toEqual(["#FFFFFF", "#F7F4EE", "#C2C9C5", "#1F4437", "#66776F", "#94A09A"]);
    expect(p.route(1).textOnStrong).toBe("#1F4437"); // yellow fill gets dark ink
    expect(p.route(0).textOnStrong).toBe("#FFFFFF");
  });

  it("re-brands the note export: overridden accent and lanes appear, defaults don't", () => {
    const doc = normalizeLoomDocument({
      theme: { accent1: "#AA0000", lanes: ["#0000FF", "#00AA00"] },
      architecture: {
        columns: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
        nodes: [
          { id: "x", label: "X", type: "agent", col: 0, row: 0 },
          { id: "y", label: "Y", type: "agent", col: 1, row: 0 },
        ],
        edges: [{ from: "x", to: "y" }],
      },
    });
    const svg = renderNoteFigure({ doc, orderedTasks: [], highlight: new Map([["x", { role: "main", routeIndex: 0 }]]) }).svg;
    expect(svg).toContain("#AA0000"); // route 1 strong = accent1
    expect(svg).not.toContain("#2F6B55");
    const p = notePalette(doc.theme);
    expect(svg).toContain(p.lane(0).tile);
    expect(svg).toContain(p.lane(1).tile);
  });
});
