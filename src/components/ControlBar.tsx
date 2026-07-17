import type { PendingDecision } from "../state/useLoomState";

interface Props {
  canGoBack: boolean;
  goBack: () => void;
  goNext: () => void;
  pendingDecisions: PendingDecision[];
  choose: (taskId: string, to: string) => void;
  isPlaying: boolean;
  togglePlay: () => void;
  isComplete: boolean;
}

export function ControlBar({
  canGoBack,
  goBack,
  goNext,
  pendingDecisions,
  choose,
  isPlaying,
  togglePlay,
  isComplete,
}: Props) {
  // At most one task in a valid document has labeled outgoing connections
  // at a time in practice (forks are unlabeled) — the fixed primary slot
  // only has room for one decision's worth of choices anyway.
  const decision = pendingDecisions[0];

  return (
    <div className="control-bar">
      <button className="control-back" onClick={goBack} disabled={!canGoBack}>
        戻る
      </button>

      <div className="control-primary">
        {decision ? (
          decision.options.map((opt) => (
            <button
              key={`${decision.taskId}-${opt.to}`}
              className={`control-choice ${opt.isBackEdge ? "back" : "forward"}`}
              onClick={() => choose(decision.taskId, opt.to)}
            >
              {opt.label}
            </button>
          ))
        ) : isComplete ? (
          <button className="control-choice complete" disabled>
            完了
          </button>
        ) : (
          <button className="control-choice forward" onClick={goNext}>
            次へ
          </button>
        )}
      </div>

      <button className="control-autoplay" onClick={togglePlay} disabled={isComplete}>
        {isPlaying ? "一時停止" : "自動再生"}
      </button>
    </div>
  );
}
