/**
 * Truncates each line of a label independently (architecture labels use
 * `\n` for a second line) rather than the whole string, so a long second
 * line can't push the first line off just as easily, and vice versa. CSS
 * `text-overflow: ellipsis` on the node is still the visual backstop —
 * this exists for labels so long that ellipsis-by-pixel-width alone reads
 * inconsistently across a diagram (short single-char overflow vs. a
 * paragraph both just get "…").
 */
export function truncateLabel(label: string, maxCharsPerLine: number): string {
  return label
    .split("\n")
    .map((line) => (line.length > maxCharsPerLine ? `${line.slice(0, maxCharsPerLine - 1)}…` : line))
    .join("\n");
}
