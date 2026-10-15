import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeDocFromLocationHash, encodeDocToShareUrl } from "../urlShare";
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
});
