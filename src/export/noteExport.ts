import { addIoHighlights } from "../graph/taskFlow";
import type { LoomDocument, Task } from "../types";
import { figureToPng } from "./rasterize";
import { renderNoteFigure, type NoteFigureInput, type NoteHighlight } from "./renderNoteSvg";
import { stepOrder } from "./stepOrder";

export interface ExportFile {
  name: string;
  blob: Blob;
}
export interface ExportResult {
  files: ExportFile[];
  warnings: string[];
}

const FONT_WARNING = "Noto Sans JP を埋め込めなかったため、端末のフォントで書き出しました。";

/** Highlight for a single task, as useLoomState would compute it (route 1). */
export function highlightForTask(t: Task): NoteHighlight {
  const m: NoteHighlight = new Map();
  m.set(t.mainNode, { role: "main", routeIndex: 0 });
  addIoHighlights(m, t, 0);
  return m;
}

function collect(warnings: string[], more: string[]) {
  more.forEach((w) => !warnings.includes(w) && warnings.push(w));
}

export async function exportOverview(doc: LoomDocument): Promise<ExportResult> {
  const fig = renderNoteFigure({ doc, orderedTasks: stepOrder(doc.flow) });
  const png = await figureToPng(fig);
  const warnings = [...fig.warnings];
  if (!png.fontEmbedded) warnings.push(FONT_WARNING);
  return { files: [{ name: "loom_overview.png", blob: png.blob }], warnings };
}

/**
 * The one place that decides what the 現在のステップ figure contains. The
 * note view renders exactly this input with renderNoteFigure, so the
 * on-screen canvas and the exported PNG come from the same SVG string.
 * No current task -> overview figure.
 */
export function currentFigureInput(doc: LoomDocument, currentTasks: Task[], highlight: NoteHighlight): NoteFigureInput {
  const ordered = stepOrder(doc.flow);
  if (currentTasks.length === 0) return { doc, orderedTasks: ordered };
  const idx = ordered.findIndex((t) => t.id === currentTasks[0]?.id);
  return {
    doc,
    orderedTasks: ordered,
    highlight,
    stepTasks: currentTasks,
    stepLabel: idx >= 0 ? `STEP ${idx + 1} / ${ordered.length}` : undefined,
  };
}

export async function exportCurrentStep(
  doc: LoomDocument,
  currentTasks: Task[],
  highlight: NoteHighlight,
): Promise<ExportResult> {
  const ordered = stepOrder(doc.flow);
  const idx = ordered.findIndex((t) => t.id === currentTasks[0]?.id);
  const fig = renderNoteFigure(currentFigureInput(doc, currentTasks, highlight));
  const png = await figureToPng(fig);
  const warnings = [...fig.warnings];
  if (!png.fontEmbedded) warnings.push(FONT_WARNING);
  const name = `loom_step_${String(idx + 1).padStart(2, "0")}.png`;
  return { files: [{ name, blob: png.blob }], warnings };
}

export async function exportAllSteps(doc: LoomDocument): Promise<ExportResult> {
  const { default: JSZip } = await import("jszip");
  const ordered = stepOrder(doc.flow);
  const zip = new JSZip();
  const warnings: string[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const t = ordered[i];
    const fig = renderNoteFigure({
      doc,
      orderedTasks: ordered,
      highlight: highlightForTask(t),
      stepTasks: [t],
      stepLabel: `STEP ${i + 1} / ${ordered.length}`,
    });
    const png = await figureToPng(fig);
    collect(warnings, fig.warnings);
    if (!png.fontEmbedded) collect(warnings, [FONT_WARNING]);
    zip.file(`step_${String(i + 1).padStart(2, "0")}_${t.id}.png`, png.blob);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return { files: [{ name: "loom_steps.zip", blob }], warnings };
}

export function downloadFile(f: ExportFile) {
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
