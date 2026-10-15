import { describe, expect, it } from "vitest";
import { truncateLabel } from "../textUtils";

describe("truncateLabel", () => {
  it("leaves short labels alone", () => {
    expect(truncateLabel("abc", 5)).toBe("abc");
    expect(truncateLabel("abcde", 5)).toBe("abcde");
  });
  it("truncates with an ellipsis within the max length", () => {
    expect(truncateLabel("abcdefgh", 5)).toBe("abcd…");
  });
  it("truncates each line independently", () => {
    expect(truncateLabel("abcdefgh\nxy\n123456", 4)).toBe("abc…\nxy\n123…");
  });
});
