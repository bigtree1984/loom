import { MAX_CHARS_PER_LINE } from "./noteSpec";

const NARROW = new Set([..."iljtfrI.,:;'!|()[]-/ "]);
const WIDE = new Set([..."mwMW@%"]);

/**
 * Width of one character in em. Full-width (CJK, kana, full-width forms)
 * is 1em in Noto Sans JP. Latin glyphs are estimated per class (narrow /
 * wide / upper / lower) rather than one flat average, so common product
 * names ("CloudFront", "DynamoDB") are measured close to their real width
 * instead of being forced onto two lines. Still slightly generous.
 */
export function charEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x20) return 0.3;
  if (c < 0x2000) {
    if (NARROW.has(ch)) return 0.32;
    if (WIDE.has(ch)) return 0.86;
    if (/[A-Z]/.test(ch)) return 0.68;
    if (/[0-9]/.test(ch)) return 0.58;
    return 0.56;
  }
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

/** Latin letters/digits (plus in-word joiners) form one unbreakable token. */
const WORD_RE = /[A-Za-z0-9][A-Za-z0-9_\-.'/+&]*/y;

/** Splits into tokens: Latin words, single spaces, and single other chars. */
export function tokenize(para: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < para.length) {
    WORD_RE.lastIndex = i;
    const m = WORD_RE.exec(para);
    if (m) {
      out.push(m[0]);
      i += m[0].length;
    } else {
      const ch = String.fromCodePoint(para.codePointAt(i)!);
      out.push(ch);
      i += ch.length;
    }
  }
  return out;
}

/**
 * Greedy wrap for mixed Japanese / Latin text.
 *  - Japanese wraps per character.
 *  - A run of Latin letters/digits is never split if it fits on a line by
 *    itself; it moves to the next line whole.
 *  - Only a single word wider than the line is broken by character.
 *  - Explicit "\n" is honored. Overflow beyond `maxLines` is cut with "…"
 *    on the last line.
 */
export function wrapText(text: string, { maxEm, maxLines, maxChars = MAX_CHARS_PER_LINE }: WrapOptions): string[] {
  const lines: string[] = [];
  let truncated = false;
  const paragraphs = text.replace(/\r/g, "").split("\n").map((p) => p.trim()).filter((p) => p.length > 0);
  const fits = (s: string) => textEm(s) <= maxEm + 1e-6 && [...s].length <= maxChars;

  outer: for (const para of paragraphs) {
    let line = "";
    const flush = (): boolean => {
      if (lines.length === maxLines) return false;
      lines.push(line.trimEnd());
      line = "";
      return true;
    };
    for (const tok of tokenize(para)) {
      if (tok === " " && line === "") continue;
      if (fits(line + tok)) {
        line += tok;
        continue;
      }
      if (line.trim() !== "") {
        if (!flush()) {
          truncated = true;
          break outer;
        }
      }
      if (tok === " ") continue;
      if (fits(tok)) {
        line = tok;
        continue;
      }
      // A single token wider than the line: break it by character.
      for (const ch of tok) {
        if (!fits(line + ch) && line !== "") {
          if (!flush()) {
            truncated = true;
            break outer;
          }
        }
        line += ch;
      }
    }
    if (line.trim() !== "" && !flush()) {
      truncated = true;
      break;
    }
  }

  if (truncated && lines.length > 0) {
    const last = [...lines[lines.length - 1]];
    while (last.length > 0 && (textEm(last.join("")) + 1 > maxEm || last.length + 1 > maxChars)) last.pop();
    lines[lines.length - 1] = last.join("").trimEnd() + ELLIPSIS;
  }
  return lines;
}
