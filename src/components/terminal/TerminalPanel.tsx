import { useRef } from "react";
import { Eraser, PlugZap, RefreshCw, TerminalSquare } from "lucide-react";
import type { ServerConfig, TerminalSession } from "../../types";
import type { useTerminals } from "../../hooks/useTerminals";
import { ErrorBoundary } from "../common/ErrorBoundary";
import { TerminalTabs } from "./TerminalTabs";
import { TerminalView } from "./TerminalView";
import type { TerminalViewHandle } from "./TerminalView";
import "./terminal.css";

interface Props {
  terminals: ReturnType<typeof useTerminals>;
  servers: ServerConfig[];
  panelVisible: boolean;
}

export function TerminalPanel({ terminals, servers, panelVisible }: Props) {
  const {
    sessions,
    activeId,
    closeSession,
    reconnectSession,
    setActive,
    setBackendSessionId,
    setStatus,
  } = terminals;

  // 快照 session -> server：即使配置被删除，已开会话仍保留连接参数
  const snapRef = useRef<Record<string, ServerConfig>>({});
  const viewRefs = useRef(new Map<string, TerminalViewHandle>());
  const reconnectingRef = useRef(new Set<string>());
  const resolve = (s: TerminalSession): ServerConfig | undefined => {
    const found = servers.find((sv) => sv.id === s.serverId);
    if (found) snapRef.current[s.id] = found;
    return snapRef.current[s.id];
  };

  const activeSession = sessions.find((session) => session.id === activeId);
  const activeServer = activeSession ? resolve(activeSession) : undefined;
  const canReconnect =
    activeSession?.status === "disconnected" || activeSession?.status === "error";
  const sessionCountByServer = new Map<string, number>();
  for (const session of sessions) {
    sessionCountByServer.set(
      session.serverId,
      (sessionCountByServer.get(session.serverId) ?? 0) + 1,
    );
  }
  const isOnlySessionForServer = (session: TerminalSession) =>
    sessionCountByServer.get(session.serverId) === 1;

  const handleReconnect = async (sessionId: string) => {
    const reconnectingSession = sessions.find((session) => session.id === sessionId);
    if (!reconnectingSession) return;
    if (reconnectingRef.current.has(sessionId)) return;
    reconnectingRef.current.add(sessionId);
    try {
      await viewRefs.current
        .get(sessionId)
        ?.disconnect(isOnlySessionForServer(reconnectingSession));
    } catch {
      // 即使旧 Shell 清理失败，也允许当前标签继续重新建立终端会话。
    }
    reconnectSession(sessionId);
    reconnectingRef.current.delete(sessionId);
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

      {activeSession && activeServer && (
        <div className="terminal-toolbar">
          <div className="terminal-toolbar-info">
            <span className={`status-dot ${activeSession.status}`} />
            <span>{activeServer.username}@{activeServer.host}:{activeServer.port}</span>
            <span className="terminal-status-text">
              {activeSession.status === "connecting"
                ? "连接中"
                : activeSession.status === "connected"
                  ? "已连接"
                  : activeSession.status === "error"
                    ? "连接失败"
                    : "已断开"}
            </span>
          </div>
          <div className="terminal-toolbar-actions">
            {canReconnect && (
              <button
                className="icon-btn"
                type="button"
                title="重新连接"
                onClick={() => void handleReconnect(activeSession.id)}
              >
                <RefreshCw size={15} />
              </button>
            )}
            <button
              className="icon-btn"
              type="button"
              title="清屏"
              onClick={() => viewRefs.current.get(activeSession.id)?.clear()}
            >
              <Eraser size={15} />
            </button>
            <button
              className="icon-btn"
              type="button"
              title="断开连接"
              disabled={activeSession.status !== "connected"}
              onClick={() =>
                void viewRefs.current
                  .get(activeSession.id)
                  ?.disconnect(isOnlySessionForServer(activeSession))
              }
            >
              <PlugZap size={15} />
            </button>
          </div>
        </div>
      )}

      <div className="terminal-body">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <TerminalSquare size={30} strokeWidth={1.5} />
            <div className="empty-title">未连接终端</div>
            <div className="empty-hint">选择一台服务器以建立 SSH 连接</div>
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
                  key={`${s.id}:${s.generation}`}
                  ref={(handle) => {
                    if (handle) viewRefs.current.set(s.id, handle);
                    else viewRefs.current.delete(s.id);
                  }}
                  session={s}
                  server={server}
                  visible={panelVisible && s.id === activeId}
                  disconnectConnectionOnDispose={isOnlySessionForServer(s)}
                  setBackendSessionId={setBackendSessionId}
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
