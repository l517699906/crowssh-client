import { useCallback, useState } from "react";
import * as agentApi from "../api/agent";
import type { ServerConfig, SessionStatus, TerminalSession } from "../types";
import { uid } from "../lib/storage";
import { abortConversationStream } from "./useChat";
import { useChatStore } from "../store/chatStore";
import { useWorkspaceStore } from "../store/workspaceStore";

export function useTerminals() {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const interruptSessionChat = useCallback((id: string) => {
    const chatState = useChatStore.getState();
    const conversationId = chatState.runningByTerminal[id];
    if (!conversationId) return;

    const conversation = chatState.conversations.find(
      (item) => item.id === conversationId,
    );
    const terminal = sessions.find((item) => item.id === id);
    if (conversation?.serverSessionId && terminal?.backendSessionId) {
      void agentApi.cancelChatStream(
        conversation.serverSessionId,
        terminal.backendSessionId,
      );
    }
    abortConversationStream(conversationId);
  }, [sessions]);

  /** 为服务器开启一个新终端会话（实际 SSH 连接由 TerminalView 挂载时发起） */
  const openSession = useCallback((server: ServerConfig) => {
    const sessionId = uid();
    const baseTitle = server.name || `${server.username}@${server.host}`;

    setSessions((prev) => {
      const occupiedNumbers = new Set(
        prev
          .filter((session) => session.serverId === server.id)
          .map((session) => session.tabNumber),
      );
      let tabNumber = 1;
      while (occupiedNumbers.has(tabNumber)) tabNumber += 1;

      const session: TerminalSession = {
        id: sessionId,
        serverId: server.id,
        tabNumber,
        title: tabNumber === 1 ? baseTitle : `${baseTitle} (${tabNumber})`,
        status: "connecting",
        generation: 0,
      };
      return [...prev, session];
    });
    setActiveId(sessionId);
  }, []);

  const closeSession = useCallback((id: string) => {
    interruptSessionChat(id);
    useChatStore.getState().releaseTerminal(id);
    useWorkspaceStore.getState().removeWorkspace(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      setActiveId((cur) =>
        cur === id ? (next.length ? next[next.length - 1].id : null) : cur,
      );
      return next;
    });
  }, [interruptSessionChat]);

  const setStatus = useCallback(
    (id: string, status: SessionStatus, error?: string) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, status, error } : s)),
      );
    },
    [],
  );

  const setBackendSessionId = useCallback((id: string, backendSessionId?: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id ? { ...session, backendSessionId } : session,
      ),
    );
  }, []);

  const reconnectSession = useCallback((id: string) => {
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              generation: session.generation + 1,
              status: "connecting",
              backendSessionId: undefined,
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
    interruptSessionChat,
    setActive: setActiveId,
    setStatus,
    setBackendSessionId,
    reconnectSession,
  };
}
