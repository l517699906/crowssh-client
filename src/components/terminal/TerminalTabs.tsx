import { X } from "lucide-react";
import type { TerminalSession } from "../../types";

interface Props {
  sessions: TerminalSession[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

export function TerminalTabs({ sessions, activeId, onSelect, onClose }: Props) {
  return (
    <div className="terminal-tabs">
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`terminal-tab${s.id === activeId ? " active" : ""}`}
          onClick={() => onSelect(s.id)}
          title={s.error ?? s.title}
        >
          <span className={`status-dot ${s.status}`} />
          <span className="tab-title">{s.title}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(s.id);
            }}
            aria-label="关闭"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
