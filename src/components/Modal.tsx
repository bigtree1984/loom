import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "large";
  /** Kept mounted (its form state survives) but not shown — used while the
   * user picks nodes/tasks on the diagrams. */
  hidden?: boolean;
}

export function Modal({ title, onClose, children, size = "default", hidden = false }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose} style={hidden ? { display: "none" } : undefined}>
      <div className={`modal-card${size === "large" ? " modal-card-large" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose} aria-label="閉じる">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
