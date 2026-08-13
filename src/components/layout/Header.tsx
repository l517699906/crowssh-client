import { PanelLeft, Plus, Sparkles, TerminalSquare } from "lucide-react";
import { useLayoutStore, type LayoutPane } from "../../store/layoutStore";
import type { useTerminals } from "../../hooks/useTerminals";
import { TransferCenter } from "../transfers/TransferCenter";
import { ServerMonitorPanel } from "../monitor/ServerMonitorPanel";
import { WindowTitleBar } from "../common/WindowTitleBar";

interface Props {
  terminals: ReturnType<typeof useTerminals>;
  onAddServer: () => void;
}

const NARROW_LAYOUT_QUERY = "(max-width: 760px)";

export function Header({ terminals, onAddServer }: Props) {
  const toggleLeft = useLayoutStore((s) => s.toggleLeft);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const toggleRight = useLayoutStore((s) => s.toggleRight);
  const activatePane = useLayoutStore((s) => s.activatePane);
  const activePane = useLayoutStore((s) => s.activePane);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);

  const active = terminals.sessions.find((s) => s.id === terminals.activeId);
  const selectOrTogglePane = (pane: LayoutPane, toggle: () => void) => {
    if (window.matchMedia(NARROW_LAYOUT_QUERY).matches && activePane !== pane) {
      activatePane(pane);
      return;
    }
    toggle();
  };

  return (
    <WindowTitleBar className="app-header">
      <div className="header-left">
        <button
          className="icon-btn"
          title="折叠侧边栏"
          onClick={() => selectOrTogglePane("left", toggleLeft)}
        >
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
        <ServerMonitorPanel terminal={active} />
      </div>

      <div className="header-title">CrowSSH</div>

      <div className="header-right">
        <TransferCenter />
        <button
          className={`icon-btn${terminalVisible ? " active" : ""}${
            activePane === "terminal" ? " pane-focused" : ""
          }`}
          title="终端面板"
          onClick={() => selectOrTogglePane("terminal", toggleTerminal)}
        >
          <TerminalSquare size={17} />
        </button>
        <button
          className={`icon-btn${rightVisible ? " active" : ""}${
            activePane === "right" ? " pane-focused" : ""
          }`}
          title="AI 助手"
          onClick={() => selectOrTogglePane("right", toggleRight)}
        >
          <Sparkles size={17} />
        </button>
      </div>
    </WindowTitleBar>
  );
}
