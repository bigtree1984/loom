import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeDocFromLocationHash, decodeShareFromLocationHash, encodeDocToShareUrl, readModeFromLocationHash, withModeInHash } from "../urlShare";
import type { LoomDocument } from "../types";

const doc: LoomDocument = {
  architecture: { nodes: [{ id: "a", label: "日本語 ✓", type: "backend" }], edges: [] },
  flow: { tasks: [], connections: [] },
};

afterEach(() => vi.unstubAllGlobals());

describe("urlShare", () => {
  it("round-trips a document through the URL fragment", async () => {
    vi.stubGlobal("location", { origin: "http://x.test", pathname: "/app", hash: "" });
    const url = await encodeDocToShareUrl(doc);
    expect(url.startsWith("http://x.test/app#doc=")).toBe(true);
    expect(url.slice(url.indexOf("#doc=") + 5)).not.toMatch(/[+/=]/);
    vi.stubGlobal("location", { origin: "http://x.test", pathname: "/app", hash: url.slice(url.indexOf("#")) });
    expect(await decodeDocFromLocationHash()).toEqual(doc);
  });
  it("returns null without a doc hash", async () => {
    vi.stubGlobal("location", { origin: "", pathname: "/", hash: "" });
    expect(await decodeDocFromLocationHash()).toBeNull();
    vi.stubGlobal("location", { origin: "", pathname: "/", hash: "#doc=" });
    expect(await decodeDocFromLocationHash()).toBeNull();
  });
  it("round-trips mode and defaults to present when absent", async () => {
    vi.stubGlobal("location", { origin: "http://x.test", pathname: "/app", hash: "" });
    for (const mode of ["edit", "present"] as const) {
      const url = await encodeDocToShareUrl(doc, mode);
      vi.stubGlobal("location", { origin: "http://x.test", pathname: "/app", hash: url.slice(url.indexOf("#")) });
      expect(await decodeShareFromLocationHash()).toEqual({ doc, mode });
      expect(readModeFromLocationHash()).toBe(mode);
    }
    const old = await encodeDocToShareUrl(doc);
    vi.stubGlobal("location", { origin: "http://x.test", pathname: "/app", hash: old.slice(old.indexOf("#")) });
    expect((await decodeShareFromLocationHash())?.mode).toBe("present");
    expect(readModeFromLocationHash()).toBeNull();
  });
  it("swaps only the mode param", () => {
    expect(withModeInHash("#doc=abc-_9&mode=present", "edit")).toBe("#doc=abc-_9&mode=edit");
    expect(withModeInHash("#doc=abc", "present")).toBe("#doc=abc&mode=present");
    expect(withModeInHash("", "edit")).toBe("#mode=edit");
  });
});
