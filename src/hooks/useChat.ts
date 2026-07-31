import { useCallback, useEffect, useRef, useState } from "react";
import type { Agent, ChatMessage, Conversation } from "../types";
import * as agentApi from "../api/agent";
import { uid } from "../lib/storage";
import { useSettingsStore } from "../store/settingsStore";
import { useAiConfigStore } from "../store/aiConfigStore";
import { readAiSecretForRequest } from "../api/aiSecrets";

function createConversation(agentId: string): Conversation {
  return {
    id: uid(),
    title: "新对话",
    agentId,
    messages: [],
    createdAt: Date.now(),
  };
}

export function useChat(terminalSessionId?: string) {
  const userId = useSettingsStore((state) => state.userId);
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const activeProfile = useAiConfigStore((state) =>
    state.profiles.find((profile) => profile.id === state.activeProfileId),
  );
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const active = conversations.find((item) => item.id === activeId) ?? conversations[0] ?? null;

  useEffect(() => {
    let cancelled = false;

    const loadAgents = async () => {
      setLoadingAgents(true);
      setError(null);
      const response = await agentApi.getAgentConfigs();
      if (cancelled) return;

      if (response.code !== "0000" || !response.data?.length) {
        setAgents([]);
        setError(response.info || "服务端没有可用智能体");
        setLoadingAgents(false);
        return;
      }

      const nextAgents = response.data.map((agent) => ({
        id: agent.agentId,
        name: agent.agentName,
        description: agent.agentDesc,
      }));
      const firstAgent = nextAgents[0];
      const availableIds = new Set(nextAgents.map((agent) => agent.id));
      const initialConversation = createConversation(firstAgent.id);

      setAgents(nextAgents);
      setConversations((current) => {
        if (current.length === 0) return [initialConversation];
        return current.map((conversation) =>
          availableIds.has(conversation.agentId)
            ? conversation
            : { ...conversation, agentId: firstAgent.id, serverSessionId: undefined },
        );
      });
      setActiveId((current) => current ?? initialConversation.id);
      setLoadingAgents(false);
    };

    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  useEffect(() => {
    setConversations((current) =>
      current.map((conversation) => ({ ...conversation, serverSessionId: undefined })),
    );
  }, [userId]);

  useEffect(() => () => streamAbortRef.current?.abort(), []);

  const newConversation = useCallback(() => {
    const firstAgent = agents[0];
    if (!firstAgent) return;
    const conversation = createConversation(firstAgent.id);
    setConversations((current) => [conversation, ...current]);
    setActiveId(conversation.id);
  }, [agents]);

  const setAgent = useCallback((agentId: string) => {
    if (!agents.some((agent) => agent.id === agentId)) return;
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeId
          ? { ...conversation, agentId, serverSessionId: undefined }
          : conversation,
      ),
    );
  }, [activeId, agents]);

  const patchMessage = useCallback(
    (conversationId: string, messageId: string, patch: Partial<ChatMessage>) => {
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id !== conversationId
            ? conversation
            : {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? { ...message, ...patch } : message,
                ),
              },
        ),
      );
    },
    [],
  );

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || !active || sending) return;

    const userMessage: ChatMessage = {
      id: uid(),
      role: "user",
      content,
      createdAt: Date.now(),
    };
    const assistantMessage: ChatMessage = {
      id: uid(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      pending: true,
    };

    setConversations((current) =>
      current.map((conversation) =>
        conversation.id !== active.id
          ? conversation
          : {
              ...conversation,
              title: conversation.messages.length === 0 ? content.slice(0, 20) : conversation.title,
              messages: [...conversation.messages, userMessage, assistantMessage],
            },
      ),
    );

    setSending(true);
    setError(null);
    try {
      if (!activeProfile) {
        throw new Error("请先在设置中配置并启用 AI 模型");
      }
      const apiKey = await readAiSecretForRequest(activeProfile.credentialId);

      let sessionId = active.serverSessionId;
      if (!sessionId) {
        const sessionResponse = await agentApi.createSession(active.agentId, userId);
        if (sessionResponse.code !== "0000" || !sessionResponse.data?.sessionId) {
          throw new Error(sessionResponse.info || "创建会话失败");
        }
        sessionId = sessionResponse.data.sessionId;
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === active.id ? { ...conversation, serverSessionId: sessionId } : conversation,
          ),
        );
      }

      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      let fullText = "";
      let toolCompleted = false;

      for await (const event of agentApi.streamChatMessage(
        {
          agentId: active.agentId,
          userId,
          sessionId,
          message: content,
          terminalSessionId,
          runtimeModel: {
            provider: activeProfile.provider,
            baseUrl: activeProfile.baseUrl,
            apiKey,
            model: activeProfile.model,
            temperature: activeProfile.temperature,
            maxTokens: activeProfile.maxTokens,
          },
        },
        abortController.signal,
      )) {
        if (event.event === "text") {
          fullText = event.fullText ?? `${fullText}${event.content}`;
          patchMessage(active.id, assistantMessage.id, { content: fullText });
        } else if (event.event === "tool_result") {
          toolCompleted = event.status === "success";
        } else if (event.event === "done") {
          fullText = event.content || fullText;
        } else if (event.event === "error") {
          throw new Error(event.content || "智能体执行失败");
        }
      }

      if (!fullText) {
        fullText = toolCompleted ? "命令执行完成，请查看终端输出。" : "智能体未返回有效内容";
      }
      patchMessage(active.id, assistantMessage.id, {
        content: fullText,
        pending: false,
      });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "对话请求失败";
      setError(message);
      patchMessage(active.id, assistantMessage.id, {
        content: `请求失败：${message}`,
        pending: false,
        error: true,
      });
    } finally {
      streamAbortRef.current = null;
      setSending(false);
    }
  }, [active, activeProfile, patchMessage, sending, terminalSessionId, userId]);

  return {
    agents,
    conversations,
    active,
    activeId,
    loadingAgents,
    sending,
    error,
    activeProfile,
    setActiveConversation: setActiveId,
    newConversation,
    setAgent,
    sendMessage,
  };
}
