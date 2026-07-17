import type { Task } from "../types";
import { routeColorFor } from "../graph/routeColors";

interface Props {
  tasks: Task[];
  routeColorByTask: Map<string, number>;
}

export function TaskDetailPanel({ tasks, routeColorByTask }: Props) {
  if (tasks.length === 0) {
    return <div className="task-detail empty">JSONを読み込んでください</div>;
  }
  // Only show route-color stripes when multiple tasks are genuinely
  // simultaneous — a single task keeps the plain, unaccented look.
  const showRouteColor = tasks.length > 1;
  return (
    <div className="task-detail">
      {tasks.map((t) => {
        const routeIndex = routeColorByTask.get(t.id) ?? 0;
        const color = routeColorFor(routeIndex).strong.border;
        return (
          <div
            key={t.id}
            className="task-detail-item"
            style={showRouteColor ? { borderLeft: `4px solid ${color}`, paddingLeft: 10 } : undefined}
          >
            <div className="task-detail-label">{t.label}</div>
            <div className="task-detail-desc">{t.description}</div>
          </div>
        );
      })}
    </div>
  );
}
