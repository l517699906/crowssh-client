import { useCallback, useRef, useState } from "react";
import type { ServerConfig, SessionStatus, TerminalSession } from "../types";
import { uid } from "../lib/storage";

export function useTerminals() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sessionIdsByServerRef = useRef(new Map<string, string>());

  /** 为服务器开启一个新终端会话（实际 SSH 连接由 TerminalView 挂载时发起） */
  const openSession = useCallback((server: ServerConfig) => {
    const existingId = sessionIdsByServerRef.current.get(server.id);
    if (existingId) {
      setActiveId(existingId);
      return;
    }

    const session: TerminalSession = {
      id: uid(),
      serverId: server.id,
      title: server.name || `${server.username}@${server.host}`,
      status: "connecting",
      generation: 0,
    };
    sessionIdsByServerRef.current.set(server.id, session.id);
    setSessions((prev) => [...prev, session]);
    setActiveId(session.id);
  }, []);

  const closeSession = useCallback((id: string) => {
    setSessions((prev) => {
      const closing = prev.find((session) => session.id === id);
      if (closing) sessionIdsByServerRef.current.delete(closing.serverId);
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

  const reconnectSession = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              generation: session.generation + 1,
              status: "connecting",
              error: undefined,
            }
          : session,
      ),
    );
  }, []);

  return {
    sessions,
    activeId,
    openSession,
    closeSession,
    setActive: setActiveId,
    setStatus,
    reconnectSession,
  };
}
