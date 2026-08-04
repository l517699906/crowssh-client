import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AssistantTextItem,
  ChatModelSelection,
  ChatTurn,
  ServerConfig,
  TerminalSession,
  TranscriptExecutionStatus,
} from "../types";
import * as agentApi from "../api/agent";
import { readAiSecretForRequest } from "../api/aiSecrets";
import { initializeChatHistory } from "../lib/chatHistory";
import { uid } from "../lib/storage";
import { useAiConfigStore } from "../store/aiConfigStore";
import { useChatStore } from "../store/chatStore";
import {
  normalizeModelIds,
  runtimeModelConfigFromProfile,
  type AiProfile,
} from "../types/aiConfig";

const streamControllers = new Map<string, AbortController>();

function normalizeResultStatus(status: string): TranscriptExecutionStatus {
  const normalized = status.toLowerCase();
  if (["success", "succeeded", "completed", "complete"].includes(normalized)) {
    return "success";
  }
  return normalized === "running" ? "running" : "error";
}

function displayServerName(server: ServerConfig | undefined, terminal: TerminalSession): string {
  if (!server) return terminal.title;
  return server.name || `${server.username}@${server.host}`;
}

function getAvailableModels(profile: AiProfile): string[] {
  return normalizeModelIds([profile.model, ...(profile.availableModels ?? [])]);
}

function resolveConversationModel(
  profile: AiProfile,
  selection?: ChatModelSelection,
): string {
  const availableModels = getAvailableModels(profile);
  return selection?.profileId === profile.id && availableModels.includes(selection.model)
    ? selection.model
    : profile.model;
}

export function useChat(terminal?: TerminalSession, server?: ServerConfig) {
  const activeProfile = useAiConfigStore((state) =>
    state.profiles.find((profile) => profile.id === state.activeProfileId),
  );
  const hydrated = useChatStore((state) => state.hydrated);
  const conversations = useChatStore((state) => state.conversations);
  const activeByTerminal = useChatStore((state) => state.activeByTerminal);
  const runningByConversation = useChatStore((state) => state.runningByConversation);
  const runningByTerminal = useChatStore((state) => state.runningByTerminal);
  const errorsByConversation = useChatStore((state) => state.errorsByConversation);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [agentError, setAgentError] = useState<string | null>(null);

  const activeId = terminal ? activeByTerminal[terminal.id] ?? null : null;
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const availableModels = useMemo(
    () => (activeProfile ? getAvailableModels(activeProfile) : []),
    [activeProfile],
  );
  const selectedModel = activeProfile
    ? resolveConversationModel(activeProfile, active?.modelSelection)
    : "";
  const sending = active ? Boolean(runningByConversation[active.id]) : false;
  const terminalBusyConversationId = terminal ? runningByTerminal[terminal.id] : undefined;
  const terminalBusy = Boolean(terminalBusyConversationId);
  const error = agentError ?? (active ? errorsByConversation[active.id] : null) ?? null;

  useEffect(() => {
    void initializeChatHistory();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadAgents = async () => {
      setLoadingAgents(true);
      setAgentError(null);
      try {
        const response = await agentApi.getAgentConfigs();
        if (cancelled) return;
        if (response.code !== "0000" || !response.data?.length) {
          setAgents([]);
          setAgentError(response.info || "服务端没有可用智能体");
          return;
        }
        setAgents(response.data.map((agent) => ({
          id: agent.agentId,
          name: agent.agentName,
          description: agent.agentDesc,
        })));
      } catch (reason) {
        if (cancelled) return;
        setAgents([]);
        setAgentError(reason instanceof Error ? reason.message : "智能体列表加载失败");
      } finally {
        if (!cancelled) setLoadingAgents(false);
      }
    };
    void loadAgents();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const firstAgent = agents[0];
    if (!hydrated || !firstAgent) return;
    useChatStore.getState().reconcileAgents(
      agents.map((agent) => agent.id),
      firstAgent.id,
    );
  }, [agents, hydrated]);

  useEffect(() => {
    const firstAgent = agents[0];
    if (!hydrated || !firstAgent || !terminal) return;
    useChatStore.getState().ensureConversation({
      agentId: firstAgent.id,
      serverId: terminal.serverId,
      serverLabel: displayServerName(server, terminal),
      terminalId: terminal.id,
    });
  }, [agents, hydrated, server, terminal]);

  const newConversation = useCallback(() => {
    const firstAgent = agents[0];
    if (!terminal || !firstAgent) return;
    useChatStore.getState().createConversation({
      agentId: firstAgent.id,
      serverId: terminal.serverId,
      serverLabel: displayServerName(server, terminal),
      terminalId: terminal.id,
    });
  }, [agents, server, terminal]);

  const setActiveConversation = useCallback((conversationId: string) => {
    if (!terminal) return false;
    const conversation = useChatStore.getState().conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation || conversation.serverId !== terminal.serverId) return false;
    useChatStore.getState().bindConversation(terminal.id, conversationId);
    return true;
  }, [terminal]);

  const setModel = useCallback((model: string) => {
    if (!activeId || !activeProfile || !availableModels.includes(model)) return;
    useChatStore.getState().dispatch({
      type: "set_model",
      conversationId: activeId,
      selection: model === activeProfile.model
        ? undefined
        : { profileId: activeProfile.id, model },
    });
  }, [activeId, activeProfile, availableModels]);

  const stopMessage = useCallback(() => {
    if (!activeId) return;
    streamControllers.get(activeId)?.abort();
  }, [activeId]);

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || !terminal?.backendSessionId || terminal.status !== "connected") return;

    const state = useChatStore.getState();
    const conversationId = state.activeByTerminal[terminal.id];
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || conversation.serverId !== terminal.serverId) return;
    if (state.runningByConversation[conversation.id] || state.runningByTerminal[terminal.id]) return;

    const turnId = uid();
    const statusItemId = `${turnId}:status`;
    const createdAt = Date.now();
    const turn: ChatTurn = {
      id: turnId,
      prompt: content,
      status: "running",
      statusText: "正在处理请求",
      items: [{
        id: statusItemId,
        type: "status",
        status: "running",
        content: "正在处理请求",
        createdAt,
      }],
      createdAt,
    };

    state.dispatch({ type: "start_turn", conversationId: conversation.id, turn });
    state.setRunning(conversation.id, terminal.id, true);
    state.setError(conversation.id, null);

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
        useChatStore.getState().dispatch({
          type: "append_text",
          conversationId: conversation.id,
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

    let abortController: AbortController | null = null;
    try {
      if (!activeProfile) throw new Error("请先在设置中配置并启用 AI 模型");
      const apiKey = await readAiSecretForRequest(activeProfile.credentialId);
      const model = resolveConversationModel(activeProfile, conversation.modelSelection);

      let sessionId = conversation.serverSessionId;
      if (!sessionId) {
        const sessionResponse = await agentApi.createSession(
          conversation.agentId,
          terminal.serverId,
          terminal.backendSessionId,
        );
        if (sessionResponse.code !== "0000" || !sessionResponse.data?.sessionId) {
          throw new Error(sessionResponse.info || "创建会话失败");
        }
        sessionId = sessionResponse.data.sessionId;
        useChatStore.getState().dispatch({
          type: "set_session",
          conversationId: conversation.id,
          sessionId,
        });
      }

      abortController = new AbortController();
      streamControllers.set(conversation.id, abortController);
      const toolCalls = new Set<string>();
      let activeTextItemId: string | null = null;
      let receivedText = "";
      let receivedDone = false;
      let toolFailed = false;
      let textSinceLastTool = false;

      for await (const event of agentApi.streamChatMessage(
        {
          agentId: conversation.agentId,
          sessionId,
          message: content,
          connectionId: terminal.serverId,
          terminalSessionId: terminal.backendSessionId,
          runtimeModel: runtimeModelConfigFromProfile(activeProfile, apiKey, model),
        },
        abortController.signal,
      )) {
        if (event.sessionId && event.sessionId !== sessionId) {
          sessionId = event.sessionId;
          useChatStore.getState().dispatch({
            type: "set_session",
            conversationId: conversation.id,
            sessionId,
          });
        }
        const eventTime = event.timestamp ?? Date.now();
        if (event.event === "status") {
          const status = normalizeResultStatus(event.status);
          useChatStore.getState().dispatch({
            type: "set_status",
            conversationId: conversation.id,
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
          useChatStore.getState().dispatch({
            type: "upsert_tool",
            conversationId: conversation.id,
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
          useChatStore.getState().dispatch({
            type: "upsert_tool",
            conversationId: conversation.id,
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

      if (!receivedDone) throw new Error("智能体流式连接提前结束，请重试");
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
      useChatStore.getState().dispatch({
        type: "complete_turn",
        conversationId: conversation.id,
        turnId,
        statusItemId,
        completedAt: Date.now(),
      });
    } catch (reason) {
      flushPendingText();
      const stopped = reason instanceof DOMException && reason.name === "AbortError";
      const message = stopped
        ? "已停止处理"
        : reason instanceof Error
          ? reason.message
          : "对话请求失败";
      if (message.includes("会话不存在或已失效") || message.includes("Session not found")) {
        useChatStore.getState().dispatch({
          type: "clear_session",
          conversationId: conversation.id,
        });
      }
      useChatStore.getState().dispatch({
        type: "fail_turn",
        conversationId: conversation.id,
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
      useChatStore.getState().setError(conversation.id, stopped ? null : message);
    } finally {
      if (animationFrameId !== null || pendingText.size > 0) flushPendingText();
      if (abortController && streamControllers.get(conversation.id) === abortController) {
        streamControllers.delete(conversation.id);
      }
      useChatStore.getState().setRunning(conversation.id, terminal.id, false);
    }
  }, [activeProfile, terminal]);

  return {
    agents,
    conversations,
    active,
    activeId,
    activeProfile,
    availableModels,
    selectedModel,
    hydrated,
    loadingAgents,
    sending,
    terminalBusy,
    error,
    newConversation,
    setActiveConversation,
    setModel,
    sendMessage,
    stopMessage,
  };
}
