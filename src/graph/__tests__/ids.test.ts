import { describe, expect, it } from "vitest";
import { nextId } from "../ids";

describe("nextId", () => {
  it("starts at 1", () => expect(nextId("node", [])).toBe("node_1"));
  it("uses max suffix + 1 and ignores non-matching ids", () =>
    expect(nextId("node", ["gcs", "node_2", "node_10", "node_x", "task_99"])).toBe("node_11"));
  it("accepts any iterable", () => expect(nextId("task", new Set(["t10", "task_3"]))).toBe("task_4"));
});
