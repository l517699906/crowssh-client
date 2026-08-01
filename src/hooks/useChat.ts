import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type {
  Agent,
  AssistantTextItem,
  ChatTurn,
  Conversation,
  ErrorTranscriptItem,
  StatusTranscriptItem,
  ToolTranscriptItem,
  TranscriptExecutionStatus,
} from "../types";
import * as agentApi from "../api/agent";
import { uid } from "../lib/storage";
import { useSettingsStore } from "../store/settingsStore";
import { useAiConfigStore } from "../store/aiConfigStore";
import { readAiSecretForRequest } from "../api/aiSecrets";

type ConversationAction =
  | {
      type: "reconcile_agents";
      availableAgentIds: string[];
      fallbackAgentId: string;
      initialConversation: Conversation;
    }
  | { type: "reset_sessions" }
  | { type: "prepend_conversation"; conversation: Conversation }
  | { type: "set_agent"; conversationId: string; agentId: string }
  | { type: "set_session"; conversationId: string; sessionId: string }
  | { type: "start_turn"; conversationId: string; turn: ChatTurn }
  | {
      type: "append_text";
      conversationId: string;
      turnId: string;
      item: AssistantTextItem;
    }
  | {
      type: "upsert_tool";
      conversationId: string;
      turnId: string;
      item: ToolTranscriptItem;
    }
  | {
      type: "set_status";
      conversationId: string;
      turnId: string;
      item: StatusTranscriptItem;
    }
  | {
      type: "complete_turn";
      conversationId: string;
      turnId: string;
      statusItemId: string;
      completedAt: number;
    }
  | {
      type: "fail_turn";
      conversationId: string;
      turnId: string;
      statusItemId: string;
      completedAt: number;
      item: ErrorTranscriptItem;
    };

function updateTurn(
  conversations: Conversation[],
  conversationId: string,
  turnId: string,
  update: (turn: ChatTurn) => ChatTurn,
) {
  return conversations.map((conversation) =>
    conversation.id !== conversationId
      ? conversation
      : {
          ...conversation,
          turns: conversation.turns.map((turn) => (turn.id === turnId ? update(turn) : turn)),
        },
  );
}

function conversationReducer(
  conversations: Conversation[],
  action: ConversationAction,
): Conversation[] {
  switch (action.type) {
    case "reconcile_agents": {
      if (conversations.length === 0) return [action.initialConversation];
      const availableIds = new Set(action.availableAgentIds);
      return conversations.map((conversation) =>
        availableIds.has(conversation.agentId)
          ? conversation
          : {
              ...conversation,
              agentId: action.fallbackAgentId,
              serverSessionId: undefined,
            },
      );
    }
    case "reset_sessions":
      return conversations.map((conversation) => ({
        ...conversation,
        serverSessionId: undefined,
      }));
    case "prepend_conversation":
      return [action.conversation, ...conversations];
    case "set_agent":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              agentId: action.agentId,
              serverSessionId: undefined,
            }
          : conversation,
      );
    case "set_session":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? { ...conversation, serverSessionId: action.sessionId }
          : conversation,
      );
    case "start_turn":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              title: conversation.turns.length === 0
                ? action.turn.prompt.slice(0, 20)
                : conversation.title,
              turns: [...conversation.turns, action.turn],
            }
          : conversation,
      );
    case "append_text":
      return updateTurn(conversations, action.conversationId, action.turnId, (turn) => {
        const existingItem = turn.items.find((item) => item.id === action.item.id);
        return {
          ...turn,
          items: existingItem
            ? turn.items.map((item) =>
                item.id === action.item.id && item.type === "assistant_text"
                  ? { ...item, content: `${item.content}${action.item.content}` }
                  : item,
              )
            : [...turn.items, action.item],
        };
      });
    case "upsert_tool":
      return updateTurn(conversations, action.conversationId, action.turnId, (turn) => {
        const existingItem = turn.items.find(
          (item) => item.type === "tool" && item.toolCallId === action.item.toolCallId,
        );
        return {
          ...turn,
          statusText: action.item.status === "running" ? "正在执行命令" : turn.statusText,
          items: existingItem
            ? turn.items.map((item) =>
                item.type === "tool" && item.toolCallId === action.item.toolCallId
                  ? {
                      ...item,
                      ...action.item,
                      command: action.item.command || item.command,
                      toolName: action.item.toolName || item.toolName,
                      createdAt: item.createdAt,
                      startedAt: item.startedAt,
                    }
                  : item,
              )
            : [...turn.items, action.item],
        };
      });
    case "set_status":
      return updateTurn(conversations, action.conversationId, action.turnId, (turn) => ({
        ...turn,
        statusText: action.item.content,
        items: turn.items.some((item) => item.id === action.item.id)
          ? turn.items.map((item) => (item.id === action.item.id ? action.item : item))
          : [...turn.items, action.item],
      }));
    case "complete_turn":
      return updateTurn(conversations, action.conversationId, action.turnId, (turn) => ({
        ...turn,
        status: "completed",
        statusText: "处理完成",
        completedAt: action.completedAt,
        items: turn.items.map((item) =>
          item.id === action.statusItemId && item.type === "status"
            ? { ...item, status: "success", content: "处理完成" }
            : item,
        ),
      }));
    case "fail_turn":
      return updateTurn(conversations, action.conversationId, action.turnId, (turn) => ({
        ...turn,
        status: "error",
        statusText: "处理失败",
        completedAt: action.completedAt,
        items: [
          ...turn.items.map((item) =>
            item.id === action.statusItemId && item.type === "status"
              ? { ...item, status: "error" as const, content: "处理失败" }
              : item,
          ),
          action.item,
        ],
      }));
    default:
      return conversations;
  }
}

function createConversation(agentId: string): Conversation {
  return {
    id: uid(),
    title: "新对话",
    agentId,
    turns: [],
    createdAt: Date.now(),
  };
}

function normalizeResultStatus(status: string): TranscriptExecutionStatus {
  const normalized = status.toLowerCase();
  if (["success", "succeeded", "completed", "complete"].includes(normalized)) {
    return "success";
  }
  return normalized === "running" ? "running" : "error";
}

export function useChat(terminalSessionId?: string) {
  const userId = useSettingsStore((state) => state.userId);
  const serverUrl = useSettingsStore((state) => state.serverUrl);
  const activeProfile = useAiConfigStore((state) =>
    state.profiles.find((profile) => profile.id === state.activeProfileId),
  );
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, dispatch] = useReducer(conversationReducer, []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const active = conversations.find((item) => item.id === activeId)
    ?? conversations[0]
    ?? null;

  useEffect(() => {
    let cancelled = false;

    const loadAgents = async () => {
      setLoadingAgents(true);
      setError(null);
      try {
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
        const initialConversation = createConversation(firstAgent.id);

        setAgents(nextAgents);
        dispatch({
          type: "reconcile_agents",
          availableAgentIds: nextAgents.map((agent) => agent.id),
          fallbackAgentId: firstAgent.id,
          initialConversation,
        });
        setActiveId((current) => current ?? initialConversation.id);
        setLoadingAgents(false);
      } catch (reason) {
        if (cancelled) return;
        const message = reason instanceof Error ? reason.message : "智能体列表加载失败";
        setAgents([]);
        setError(message);
        setLoadingAgents(false);
      }
    };

    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, [serverUrl]);

  useEffect(() => {
    dispatch({ type: "reset_sessions" });
  }, [userId]);

  useEffect(() => () => streamAbortRef.current?.abort(), []);

  const newConversation = useCallback(() => {
    const firstAgent = agents[0];
    if (!firstAgent) return;
    const conversation = createConversation(firstAgent.id);
    dispatch({ type: "prepend_conversation", conversation });
    setActiveId(conversation.id);
  }, [agents]);

  const setAgent = useCallback((agentId: string) => {
    if (!activeId || !agents.some((agent) => agent.id === agentId)) return;
    dispatch({ type: "set_agent", conversationId: activeId, agentId });
  }, [activeId, agents]);

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || !active || sending) return;

    const turnId = uid();
    const statusItemId = `${turnId}:status`;
    const createdAt = Date.now();
    const turn: ChatTurn = {
      id: turnId,
      prompt: content,
      status: "running",
      statusText: "正在处理请求",
      items: [
        {
          id: statusItemId,
          type: "status",
          status: "running",
          content: "正在处理请求",
          createdAt,
        },
      ],
      createdAt,
    };

    dispatch({ type: "start_turn", conversationId: active.id, turn });
    setSending(true);
    setError(null);

    let animationFrameId: number | null = null;
    const pendingText = new Map<string, AssistantTextItem>();
    const flushPendingText = () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      const pendingItems = [...pendingText.values()];
      pendingText.clear();
      pendingItems.forEach((item) => {
        dispatch({
          type: "append_text",
          conversationId: active.id,
          turnId,
          item,
        });
      });
    };
    const queueText = (itemId: string, chunk: string) => {
      if (!chunk) return;
      const queued = pendingText.get(itemId);
      pendingText.set(itemId, {
        id: itemId,
        type: "assistant_text",
        content: `${queued?.content ?? ""}${chunk}`,
        createdAt: queued?.createdAt ?? Date.now(),
      });
      if (animationFrameId === null) {
        animationFrameId = requestAnimationFrame(() => {
          animationFrameId = null;
          flushPendingText();
        });
      }
    };

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
        dispatch({ type: "set_session", conversationId: active.id, sessionId });
      }

      const abortController = new AbortController();
      streamAbortRef.current = abortController;
      const toolCalls = new Set<string>();
      let activeTextItemId: string | null = null;
      let receivedText = "";
      let receivedDone = false;
      let toolFailed = false;
      let textSinceLastTool = false;

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
        const eventTime = event.timestamp ?? Date.now();

        if (event.event === "status") {
          const status = normalizeResultStatus(event.status);
          dispatch({
            type: "set_status",
            conversationId: active.id,
            turnId,
            item: {
              id: statusItemId,
              type: "status",
              status,
              content: event.content || (status === "running" ? "正在处理请求" : "处理完成"),
              createdAt,
            },
          });
        } else if (event.event === "text") {
          const nextFullText = event.fullText ?? `${receivedText}${event.content}`;
          const chunk = nextFullText.startsWith(receivedText)
            ? nextFullText.slice(receivedText.length)
            : event.content;
          receivedText = nextFullText;
          if (chunk) {
            activeTextItemId ??= uid();
            queueText(activeTextItemId, chunk);
            textSinceLastTool = true;
          }
        } else if (event.event === "tool_call") {
          flushPendingText();
          activeTextItemId = null;
          textSinceLastTool = false;
          toolCalls.add(event.toolCallId);
          dispatch({
            type: "upsert_tool",
            conversationId: active.id,
            turnId,
            item: {
              id: `${turnId}:tool:${event.toolCallId}`,
              type: "tool",
              toolCallId: event.toolCallId,
              toolName: event.toolName || "executeCommand",
              command: event.command ?? "",
              status: event.status.toLowerCase() === "error" ? "error" : "running",
              startedAt: event.startedAt ?? eventTime,
              createdAt: eventTime,
            },
          });
        } else if (event.event === "tool_result") {
          flushPendingText();
          activeTextItemId = null;
          textSinceLastTool = false;
          toolCalls.add(event.toolCallId);
          const status = normalizeResultStatus(event.status);
          toolFailed ||= status === "error";
          const startedAt = event.startedAt ?? eventTime;
          const completedAt = event.completedAt ?? eventTime;
          dispatch({
            type: "upsert_tool",
            conversationId: active.id,
            turnId,
            item: {
              id: `${turnId}:tool:${event.toolCallId}`,
              type: "tool",
              toolCallId: event.toolCallId,
              toolName: event.toolName ?? "executeCommand",
              command: event.command ?? "",
              status,
              startedAt,
              completedAt,
              durationMs: event.durationMs ?? Math.max(0, completedAt - startedAt),
              outputLength: event.outputLength,
              errorMessage: status === "error"
                ? event.errorMessage || "命令执行失败，请查看终端输出。"
                : undefined,
              createdAt: eventTime,
            },
          });
        } else if (event.event === "done") {
          receivedDone = true;
          const finalText = event.content || receivedText;
          if (finalText.startsWith(receivedText) && finalText.length > receivedText.length) {
            activeTextItemId ??= uid();
            queueText(activeTextItemId, finalText.slice(receivedText.length));
            receivedText = finalText;
            textSinceLastTool = true;
          }
        } else if (event.event === "error") {
          throw new Error(event.content || "智能体执行失败");
        }
      }

      if (!receivedDone) {
        throw new Error("智能体流式连接提前结束，请重试");
      }

      if (!receivedText || (toolCalls.size > 0 && !textSinceLastTool)) {
        activeTextItemId = uid();
        queueText(
          activeTextItemId,
          toolCalls.size > 0
            ? toolFailed
              ? "命令执行未完成，请查看上方失败状态和终端输出。"
              : "命令执行完成，完整输出已保留在终端中。"
            : "智能体已完成处理，但没有生成文本回复。",
        );
      }

      flushPendingText();
      dispatch({
        type: "complete_turn",
        conversationId: active.id,
        turnId,
        statusItemId,
        completedAt: Date.now(),
      });
    } catch (reason) {
      flushPendingText();
      const message = reason instanceof Error ? reason.message : "对话请求失败";
      dispatch({
        type: "fail_turn",
        conversationId: active.id,
        turnId,
        statusItemId,
        completedAt: Date.now(),
        item: {
          id: `${turnId}:error`,
          type: "error",
          content: message,
          createdAt: Date.now(),
        },
      });
    } finally {
      if (animationFrameId !== null || pendingText.size > 0) {
        flushPendingText();
      }
      streamAbortRef.current = null;
      setSending(false);
    }
  }, [active, activeProfile, sending, terminalSessionId, userId]);

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
