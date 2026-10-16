import type { NoteFigure } from "./renderNoteSvg";

/**
 * An SVG drawn via <img> is sandboxed: it can't see the page's web fonts
 * and can't fetch anything. So the Noto Sans JP glyphs actually used are
 * requested from Google Fonts as a subset (`text=`), inlined as data URLs
 * into an @font-face, and only then is the SVG rasterized.
 */
const FONT_CSS = "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700&display=block&text=";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });

export async function embeddedFontCss(text: string): Promise<string> {
  const chars = [...new Set([...text, ..."0123456789./ STEP…"])].join("");
  const css = await (await fetch(FONT_CSS + encodeURIComponent(chars))).text();
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
  if (urls.length === 0) throw new Error("no font urls");
  let out = css;
  for (const u of urls) {
    const data = await toDataUrl(await (await fetch(u)).blob());
    out = out.split(u).join(data);
  }
  return out;
}

export interface PngResult {
  blob: Blob;
  /** false when the web font couldn't be embedded (system font fallback). */
  fontEmbedded: boolean;
}

export async function figureToPng(fig: NoteFigure): Promise<PngResult> {
  let svg = fig.svg;
  let fontEmbedded = false;
  try {
    const css = await embeddedFontCss(fig.text);
    svg = svg.replace("<!--FONTS-->", `<style>${css}</style>`);
    fontEmbedded = true;
  } catch {
    // Offline etc.: fall back to the system Japanese fonts in FONT_FAMILY.
  }
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("SVGの読み込みに失敗しました"));
      img.src = url;
    });
    await img.decode().catch(() => undefined);
    const canvas = document.createElement("canvas");
    canvas.width = fig.width;
    canvas.height = fig.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, fig.width, fig.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNGの生成に失敗しました"))), "image/png"),
    );
    return { blob, fontEmbedded };
  } finally {
    URL.revokeObjectURL(url);
  }
}
