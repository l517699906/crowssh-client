import { useRef } from "react";
import { TerminalSquare } from "lucide-react";
import type { ServerConfig, TerminalSession } from "../../types";
import type { useTerminals } from "../../hooks/useTerminals";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./TerminalView";
import "./terminal.css";

interface Props {
  terminals: ReturnType<typeof useTerminals>;
  servers: ServerConfig[];
}

export function TerminalPanel({ terminals, servers }: Props) {
  const { sessions, activeId, closeSession, setActive, setStatus } = terminals;

  // 快照 session -> server：即使配置被删除，已开会话仍保留连接参数
  const snapRef = useRef<Record<string, ServerConfig>>({});
  const resolve = (s: TerminalSession): ServerConfig | undefined => {
    const found = servers.find((sv) => sv.id === s.serverId);
    if (found) snapRef.current[s.id] = found;
    return snapRef.current[s.id];
  };

  return (
    <>
      {sessions.length > 0 && (
        <TerminalTabs
          sessions={sessions}
          activeId={activeId}
          onSelect={setActive}
          onClose={closeSession}
        />
      )}

      <div className="terminal-body">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <TerminalSquare size={30} strokeWidth={1.5} />
            <div className="empty-title">未连接终端</div>
            <div className="empty-hint">从左侧选择一台服务器以建立 SSH 连接</div>
          </div>
        ) : (
          sessions.map((s) => {
            const server = resolve(s);
            return server ? (
              <ErrorBoundary
                key={s.id}
                fallback={(msg) => (
                  <div
                    className="terminal-view"
                    style={{ display: s.id === activeId ? "flex" : "none" }}
                  >
                    <div className="empty-state">
                      <div className="empty-title">终端初始化失败</div>
                      <div className="empty-hint">{msg}</div>
                    </div>
                  </div>
                )}
              >
                <TerminalView
                  session={s}
                  server={server}
                  visible={s.id === activeId}
                  setStatus={setStatus}
                />
              </ErrorBoundary>
            ) : null;
          })
        )}
      </div>
    </>
  );
}
