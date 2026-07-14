import { useCallback, useState } from "react";
import type { ServerConfig, SessionStatus, TerminalSession } from "../types";
import { uid } from "../lib/storage";

export function useTerminals() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  /** 为服务器开启一个新终端会话（实际 SSH 连接由 TerminalView 挂载时发起） */
  const openSession = useCallback((server: ServerConfig) => {
    const session: TerminalSession = {
      id: uid(),
      serverId: server.id,
      title: server.name || `${server.username}@${server.host}`,
      status: "connecting",
    };
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
    return session;
  }, []);

  const closeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) =>
        cur === id ? (next.length ? next[next.length - 1].id : null) : cur,
      );
      return next;
    });
  }, []);

  const setStatus = useCallback(
    (id: string, status: SessionStatus, error?: string) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, error } : s)),
      );
    },
    [],
  );

  return {
    sessions,
    activeId,
    openSession,
    closeSession,
    setActive: setActiveId,
    setStatus,
  };
}
