import { describe, expect, it } from "vitest";
import { describeAction } from "../describeAction";
import { normalizeLoomDocument } from "../normalizeDocument";

const doc = normalizeLoomDocument({
  architecture: { nodes: [{ id: "gcs", label: "GCS", type: "storage", col: 0, row: 0 }] },
  artifacts: [
    { id: "img", label: "画像" },
    { id: "ff", label: "ffmpeg", tool: true },
    { id: "v", label: "動画" },
  ],
});

describe("describeAction", () => {
  it("uses the label when given", () => expect(describeAction({ type: "create", label: "撮る" }, doc)).toBe("撮る"));
  it("reads tools as 〜を使って", () =>
    expect(describeAction({ type: "derive", artifacts: ["img", "ff"], results: ["v"] }, doc)).toBe("ffmpeg を使って 画像 をもとに 動画 を作る"));
  it("names the other node and marks copies", () =>
    expect(describeAction({ type: "receive", artifacts: ["img"], from: "gcs", keep: true }, doc)).toBe("GCS から 画像 を受け取る（写し）"));
});
