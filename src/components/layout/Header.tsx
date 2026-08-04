import { PanelLeft, Plus, Sparkles, TerminalSquare } from "lucide-react";
import { useLayoutStore } from "../../store/layoutStore";
import type { useTerminals } from "../../hooks/useTerminals";
import { TransferCenter } from "../transfers/TransferCenter";
import { WindowTitleBar } from "../common/WindowTitleBar";

interface Props {
  terminals: ReturnType<typeof useTerminals>;
  onAddServer: () => void;
}

export function Header({ terminals, onAddServer }: Props) {
  const toggleLeft = useLayoutStore((s) => s.toggleLeft);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const toggleRight = useLayoutStore((s) => s.toggleRight);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);

  const active = terminals.sessions.find((s) => s.id === terminals.activeId);

  return (
    <WindowTitleBar className="app-header">
      <div className="header-left">
        <button className="icon-btn" title="折叠侧边栏" onClick={toggleLeft}>
          <PanelLeft size={17} />
        </button>
        <button className="icon-btn" title="添加 SSH 连接" onClick={onAddServer}>
          <Plus size={18} />
        </button>
        <div className="header-divider" />
        <div className="header-conn">
          {active ? (
            <>
              <span className={`status-dot ${active.status}`} />
              <span className="header-conn-title">{active.title}</span>
            </>
          ) : (
            <span className="header-conn-empty">未连接</span>
          )}
        </div>
      </div>

      <div className="header-title">CrowSSH</div>

      <div className="header-right">
        <TransferCenter />
        <button
          className={`icon-btn${terminalVisible ? " active" : ""}`}
          title="终端面板"
          onClick={toggleTerminal}
        >
          <TerminalSquare size={17} />
        </button>
        <button
          className={`icon-btn${rightVisible ? " active" : ""}`}
          title="AI 助手"
          onClick={toggleRight}
        >
          <Sparkles size={17} />
        </button>
      </div>
    </WindowTitleBar>
  );
}
