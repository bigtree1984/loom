import { useState } from "react";
import type { LoomDocument, Task } from "../types";
import { downloadFile, exportAllSteps, exportCurrentStep, exportOverview, type ExportResult } from "./noteExport";
import type { NoteHighlight } from "./renderNoteSvg";

interface Props {
  doc: LoomDocument | null;
  currentTasks: Task[];
  highlightedArchNodes: NoteHighlight;
}

/** Header menu 「note用に書き出す」 (DESIGN_v2 §6). Self-contained so App.tsx needs one line. */
export function NoteExportMenu({ doc, currentTasks, highlightedArchNodes }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (fn: () => Promise<ExportResult>) => {
    setBusy(true);
    setStatus("書き出し中…");
    try {
      const res = await fn();
      res.files.forEach(downloadFile);
      setStatus(res.warnings.length ? `注意: ${res.warnings.join(" ")}` : null);
    } catch (e) {
      setStatus(`書き出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const onSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    e.target.value = "";
    if (!doc) return;
    if (v === "overview") run(() => exportOverview(doc));
    if (v === "step") run(() => exportCurrentStep(doc, currentTasks, highlightedArchNodes));
    if (v === "all") run(() => exportAllSteps(doc));
  };

  return (
    <>
      <select
        aria-label="note用に書き出す"
        className="note-export-menu"
        disabled={!doc || busy}
        value=""
        onChange={onSelect}
      >
        <option value="" disabled>
          note用に書き出す
        </option>
        <option value="overview">全体図（PNG）</option>
        <option value="step" disabled={currentTasks.length === 0}>
          ステップ図（PNG）
        </option>
        <option value="all">全ステップ一括（ZIP）</option>
      </select>
      {status && (
        <span className="autoload-status" role="status">
          {status}
        </span>
      )}
    </>
  );
}
