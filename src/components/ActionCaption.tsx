import { useEffect, useState } from "react";
import type { LoomDocument, Task } from "../types";
import { describeAction, stepActions } from "../graph/describeAction";
import { stepLoopTiming } from "../graph/toArtifactNodes";

interface Props {
  doc: LoomDocument;
  tasks: Task[];
  /** Changes every step so the clock restarts with the chip animations. */
  stepKey: string;
}

/**
 * Caption over the architecture diagram naming the action that is playing
 * right now, on the same clock as the looping artifact animation.
 */
export function ActionCaption({ doc, tasks, stepKey }: Props) {
  const slots = stepActions(tasks);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let id = 0;
    const tick = () => {
      setNow(performance.now() - start);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [stepKey]);
  if (slots.length === 0) return null;
  // Same rule as the chips: a keep copy or a transient signal is gone on
  // arrival, and its action rests a moment so it can be read.
  const byId = new Map((doc.artifacts ?? []).map((a) => [a.id, a]));
  const holds = new Set<number>();
  slots.forEach((slot, i) => {
    if (
      slot.some(
        ({ action: a }) =>
          (a.type === "send" || a.type === "receive") &&
          (a.keep || (a.artifacts ?? []).some((id) => byId.get(id)?.transient)),
      )
    )
      holds.add(i);
  });
  const clock = stepLoopTiming(slots.length, holds);
  // During the closing pause, keep showing the last action.
  const current = clock.slotAt(now % clock.duration);
  return (
    <ol className="action-caption" aria-label="このステップのアクション">
      {slots.map((slot, i) => (
        <li key={i} className={i === current ? "is-current" : i < current ? "is-done" : undefined}>
          <span className="action-caption-no">{i + 1}</span>
          {slot.map((s) => describeAction(s.action, doc)).join(" ／ ")}
        </li>
      ))}
    </ol>
  );
}
