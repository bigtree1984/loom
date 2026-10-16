import { MAX_CHARS_PER_LINE } from "./noteSpec";

/**
 * Width of one character in em. Full-width (CJK, kana, full-width forms)
 * is 1em in Noto Sans JP; half-width glyphs average a little over half.
 * Deliberately a touch generous so estimated lines never overflow.
 */
export function charEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x20) return 0.3;
  if (c < 0x2000) return 0.62;
  if (c >= 0xff61 && c <= 0xff9f) return 0.55; // half-width katakana
  return 1;
}

export function textEm(s: string): number {
  let w = 0;
  for (const ch of s) w += charEm(ch);
  return w;
}

const ELLIPSIS = "…";

export interface WrapOptions {
  /** Line width in em (= pixels / font size). */
  maxEm: number;
  maxLines: number;
  /** Character cap per line (note rule: 28). */
  maxChars?: number;
}

/**
 * Greedy wrap for mixed Japanese / Latin text. Breaks anywhere between
 * full-width characters; a Latin word is kept whole when it fits on a
 * line by itself. Honors explicit "\n". Overflow beyond `maxLines` is cut
 * with "…" on the last line.
 */
export function wrapText(text: string, { maxEm, maxLines, maxChars = MAX_CHARS_PER_LINE }: WrapOptions): string[] {
  const lines: string[] = [];
  let truncated = false;
  const paragraphs = text.replace(/\r/g, "").split("\n").map((p) => p.trim()).filter((p) => p.length > 0);

  outer: for (const para of paragraphs) {
    const chars = [...para];
    let i = 0;
    while (i < chars.length) {
      if (lines.length === maxLines) {
        truncated = true;
        break outer;
      }
      let em = 0;
      let j = i;
      while (j < chars.length && j - i < maxChars && em + charEm(chars[j]) <= maxEm + 1e-6) {
        em += charEm(chars[j]);
        j++;
      }
      if (j === i) j = i + 1; // always make progress
      // Don't split a Latin word if a break opportunity exists earlier.
      if (j < chars.length && isWordChar(chars[j]) && isWordChar(chars[j - 1])) {
        let k = j;
        while (k > i && isWordChar(chars[k - 1])) k--;
        if (k > i) j = k;
      }
      lines.push(chars.slice(i, j).join("").trimEnd());
      i = j;
      while (i < chars.length && chars[i] === " ") i++;
    }
  }

  if (truncated && lines.length > 0) {
    const last = [...lines[lines.length - 1]];
    while (last.length > 0 && (textEm(last.join("")) + 1 > maxEm || last.length + 1 > maxChars)) last.pop();
    lines[lines.length - 1] = last.join("").trimEnd() + ELLIPSIS;
  }
  return lines;
}

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_\-./]/.test(ch);
}
