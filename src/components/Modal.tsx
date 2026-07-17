import type { ReactNode } from "react";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "default" | "large";
}

export function Modal({ title, onClose, children, size = "default" }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
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
