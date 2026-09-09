import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  Agent,
  AssistantTextItem,
  ChatModelSelection,
  ChatTurn,
  ChatTarget,
  ToolTranscriptItem,
  TranscriptExecutionStatus,
} from "../types";
import { conversationMatchesTarget, describeChatTarget, snapshotMatchesDatabaseTarget } from "../lib/chatTarget";
import { useSqlWorkspaceStore } from "../store/sqlWorkspaceStore";
import * as agentApi from "../api/agent";
import { readAiSecretForRequest } from "../api/aiSecrets";
import { initializeChatHistory } from "../lib/chatHistory";
import { cancelAndObserveDatabaseTurn } from '../services/databaseChatCancellation';
import { uid } from "../lib/storage";
import { useAiConfigStore } from "../store/aiConfigStore";
import { useChatStore } from "../store/chatStore";
import {
  normalizeModelIds,
  runtimeModelConfigFromProfile,
  type AiProfile,
} from "../types/aiConfig";

const streamControllers = new Map<string, AbortController>();
const streamBindings = new Map<string, { sessionId?: string; resourceKind: 'SSH' | 'DB'; backendSessionId: string; turnId?: string; stopRequested: boolean }>();

export function abortConversationStream(conversationId: string) {
  streamControllers.get(conversationId)?.abort();
}

export function stopConversationStream(conversationId: string) {
  const binding = streamBindings.get(conversationId);
  if (binding) {
    binding.stopRequested = true;
    if (binding.sessionId && binding.resourceKind === 'DB' && binding.turnId) {
      void cancelAndObserveDatabaseTurn(conversationId, binding.sessionId, binding.backendSessionId, binding.turnId);
    } else if (binding.sessionId && binding.resourceKind === 'SSH') {
      void agentApi.cancelChatStream(binding.sessionId, binding.backendSessionId);
    }
  }
  // 数据库初始事件带来服务器轮次后再停止，保证取消使用可信 turnId。
  if (!binding || binding.resourceKind === 'SSH' || binding.turnId) abortConversationStream(conversationId);
}

function normalizeResultStatus(status: string): TranscriptExecutionStatus {
  const normalized = status.toLowerCase();
  if (["success", "succeeded", "completed", "complete"].includes(normalized)) {
    return "success";
  }
  if (normalized === "approval_required") return "approval_required";
  if (normalized === "running") return "running";
  if (["denied", "expired", "cancelled"].includes(normalized)) {
    return normalized as TranscriptExecutionStatus;
  }
  return "error";
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

export function useChat(target?: ChatTarget) {
  const resource = describeChatTarget(target);
  const resourceKind = resource?.resourceKind ?? "SSH";
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

  const activeId = resource ? activeByTerminal[resource.id] ?? null : null;
  const active = conversations.find((item) => item.id === activeId) ?? null;
  const availableModels = useMemo(
    () => (activeProfile ? getAvailableModels(activeProfile) : []),
    [activeProfile],
  );
  const selectedModel = activeProfile
    ? resolveConversationModel(activeProfile, active?.modelSelection)
    : "";
  const sending = active ? Boolean(runningByConversation[active.id]) : false;
  const terminalBusyConversationId = resource ? runningByTerminal[resource.id] : undefined;
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
        setAgents(response.data.filter((agent) => (agent.resourceKind ?? "SSH") === resourceKind).map((agent) => ({
          id: agent.agentId,
          name: agent.agentName,
          description: agent.agentDesc,
          resourceKind: agent.resourceKind ?? "SSH",
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
  }, [resourceKind]);

  useEffect(() => {
    const firstAgent = agents[0];
    if (!hydrated || !firstAgent || firstAgent.resourceKind !== resourceKind) return;
    useChatStore.getState().reconcileAgents(
      agents.map((agent) => agent.id),
      firstAgent.id,
      resourceKind,
    );
  }, [agents, hydrated, resourceKind]);

  useEffect(() => {
    const firstAgent = agents[0];
    if (!hydrated || !firstAgent || !resource || firstAgent.resourceKind !== resourceKind) return;
    useChatStore.getState().ensureConversation({
      agentId: firstAgent.id,
      serverId: resource.connectionId,
      serverLabel: resource.label,
      terminalId: resource.id,
      resourceKind: resource.resourceKind,
      dbConnectionId: resource.resourceKind === "DB" ? resource.connectionId : undefined,
    });
  }, [agents, hydrated, resource?.id, resource?.connectionId, resource?.label, resourceKind]);

  const newConversation = useCallback(() => {
    const firstAgent = agents[0];
    if (!resource || !firstAgent || firstAgent.resourceKind !== resourceKind) return;
    useChatStore.getState().createConversation({
      agentId: firstAgent.id,
      serverId: resource.connectionId,
      serverLabel: resource.label,
      terminalId: resource.id,
      resourceKind: resource.resourceKind,
      dbConnectionId: resource.resourceKind === "DB" ? resource.connectionId : undefined,
    });
  }, [agents, resource?.id, resource?.connectionId, resource?.label, resourceKind]);

  const setActiveConversation = useCallback((conversationId: string) => {
    if (!resource) return false;
    const conversation = useChatStore.getState().conversations.find(
      (item) => item.id === conversationId,
    );
    if (!conversation || !conversationMatchesTarget(conversation, target)
      || useChatStore.getState().runningByConversation[conversationId]) return false;
    useChatStore.getState().bindConversation(resource.id, conversationId);
    return true;
  }, [target]);

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
    stopConversationStream(activeId);
  }, [activeId]);

  const decideCommandApproval = useCallback(async (
    item: ToolTranscriptItem,
    decision: agentApi.CommandApprovalDecision,
  ) => {
    if (!activeId || !item.approvalId) {
      throw new Error("命令审批信息已失效");
    }
    const state = useChatStore.getState();
    const conversation = state.conversations.find((entry) => entry.id === activeId);
    const turn = conversation?.turns.find((entry) =>
      entry.items.some((transcriptItem) =>
        transcriptItem.type === "tool" && transcriptItem.toolCallId === item.toolCallId));
    if (!conversation?.serverSessionId || !turn) {
      throw new Error("AI 会话已失效，无法提交命令审批");
    }

    if (item.resourceKind?.startsWith('DB')) {
      const live = target?.kind === 'sql' ? useSqlWorkspaceStore.getState().workspaces[target.dbSession.dbSessionId] : undefined;
      const binding = streamBindings.get(conversation.id);
      if (!live || target?.kind !== 'sql' || !item.databaseApproval || !item.resourceSnapshot
        || !item.serverTurnId || binding?.turnId !== item.serverTurnId || binding.stopRequested
        || !state.runningByConversation[conversation.id] || live.session.lifecycleStatus !== 'READY'
        || !snapshotMatchesDatabaseTarget(item.resourceSnapshot, { ...target, dbSession: live.session })
        || !Number.isFinite(Date.parse(item.databaseApproval.expiresAt))
        || Date.parse(item.databaseApproval.expiresAt) <= Date.now()) throw new Error('数据库审批已失效，请在当前目标重新发起请求');
      const response = await agentApi.decideDatabaseApproval(item.approvalId, conversation.serverSessionId, item.serverTurnId, decision);
      if (response.code !== '0000') throw new Error(response.info || '数据库审批提交失败');
      const latest = useChatStore.getState().conversations.find((entry) => entry.id === conversation.id)
        ?.turns.find((entry) => entry.id === turn.id)?.items.find((entry) => entry.id === item.id);
      // SQL 可能在审批 HTTP 响应到达前完成，不让迟到响应覆盖最终结果。
      if (latest?.type !== 'tool' || latest.status !== 'approval_required') return;
      const status = response.data === 'APPROVED' || response.data === 'CONSUMED' ? 'running'
        : response.data === 'DENIED' ? 'denied' : response.data === 'EXPIRED' ? 'expired' : 'cancelled';
      state.dispatch({ type: 'upsert_tool', conversationId: conversation.id, turnId: turn.id, item: { ...item, status } });
      return;
    }
    if ((conversation.resourceKind ?? 'SSH') !== 'SSH') throw new Error('审批资源类型不匹配');

    const response = await agentApi.decideCommandApproval(
      item.approvalId,
      conversation.serverSessionId,
      decision,
    );
    if (response.code !== "0000") {
      throw new Error(response.info || "命令审批提交失败");
    }

    const completedAt = Date.now();
    state.dispatch({
      type: "upsert_tool",
      conversationId: conversation.id,
      turnId: turn.id,
      item: {
        ...item,
        status: decision === "approve" ? "running" : "denied",
        completedAt: decision === "deny" ? completedAt : undefined,
        durationMs: decision === "deny"
          ? Math.max(0, completedAt - item.startedAt)
          : undefined,
        errorMessage: decision === "deny" ? "用户已拒绝执行该命令。" : undefined,
      },
    });
  }, [activeId, target]);

  const sendMessage = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || !resource?.backendSessionId || !resource.ready) return;

    const state = useChatStore.getState();
    const conversationId = state.activeByTerminal[resource.id];
    const conversation = state.conversations.find((item) => item.id === conversationId);
    if (!conversation || !conversationMatchesTarget(conversation, target)) return;
    if (state.runningByConversation[conversation.id] || state.runningByTerminal[resource.id]) return;

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
    state.setRunning(conversation.id, resource.id, true);
    state.setError(conversation.id, null);
    const streamBinding = { resourceKind, backendSessionId: resource.backendSessionId, stopRequested: false } as {
      sessionId?: string; resourceKind: 'SSH' | 'DB'; backendSessionId: string; turnId?: string; stopRequested: boolean;
    };
    streamBindings.set(conversation.id, streamBinding);

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
      if (streamBinding.stopRequested) throw new DOMException('Stopped', 'AbortError');
      const model = resolveConversationModel(activeProfile, conversation.modelSelection);

      let sessionId = conversation.serverSessionId;
      if (sessionId && (resourceKind === "DB" ? conversation.dbSessionId : conversation.terminalSessionId) !== resource.backendSessionId) {
        // 工作台重新打开会产生新会话，旧聊天绑定不能继承新资源执行权。
        sessionId = undefined;
        useChatStore.getState().dispatch({
          type: "clear_session",
          conversationId: conversation.id,
        });
      }
      if (!sessionId) {
        const sessionResponse = await (resourceKind === "DB"
          ? agentApi.createDatabaseSession(conversation.agentId, resource.connectionId, resource.backendSessionId)
          : agentApi.createSession(conversation.agentId, resource.connectionId, resource.backendSessionId));
        if (sessionResponse.code !== "0000" || !sessionResponse.data?.sessionId) {
          throw new Error(sessionResponse.info || "创建会话失败");
        }
        sessionId = sessionResponse.data.sessionId;
        useChatStore.getState().dispatch({
          type: "set_session",
          conversationId: conversation.id,
          sessionId,
          ...(resourceKind === "DB" ? { dbSessionId: resource.backendSessionId } : { terminalSessionId: resource.backendSessionId }),
        });
      }

      abortController = new AbortController();
      streamBinding.sessionId = sessionId;
      if (streamBinding.stopRequested) throw new DOMException('Stopped', 'AbortError');
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
          ...(resourceKind === "DB" ? { dbConnectionId: resource.connectionId, dbSessionId: resource.backendSessionId, supportsDbApproval: true as const }
            : { connectionId: resource.connectionId, terminalSessionId: resource.backendSessionId }),
          runtimeModel: runtimeModelConfigFromProfile(activeProfile, apiKey, model),
        },
        abortController.signal,
      )) {
        if (resourceKind === 'DB') {
          if (!event.turnId || !event.resourceSnapshot || event.sessionId !== sessionId
            || target?.kind !== 'sql' || !snapshotMatchesDatabaseTarget(event.resourceSnapshot, target)
            || (streamBinding.turnId && streamBinding.turnId !== event.turnId)) throw new Error('数据库事件目标或轮次不匹配，已停止接收');
          streamBinding.turnId = event.turnId;
          if (streamBinding.stopRequested) { stopConversationStream(conversation.id); throw new DOMException('Stopped', 'AbortError'); }
        }
        if (event.sessionId && event.sessionId !== sessionId) {
          sessionId = event.sessionId;
          useChatStore.getState().dispatch({
            type: "set_session",
            conversationId: conversation.id,
            sessionId,
            ...(resourceKind === "DB" ? { dbSessionId: resource.backendSessionId } : { terminalSessionId: resource.backendSessionId }),
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
        } else if (event.event === "tool_approval_required") {
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
              status: "approval_required",
              approvalId: event.approvalId,
              riskLevel: event.riskLevel,
              resourceKind: event.resourceKind,
              serverTurnId: event.turnId,
              executionId: event.executionId,
              resourceSnapshot: event.resourceSnapshot,
              databaseApproval: event.databaseApproval,
              startedAt: event.startedAt ?? eventTime,
              createdAt: eventTime,
            },
          });
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
              resourceKind: event.resourceKind,
              serverTurnId: event.turnId,
              executionId: event.executionId,
              resourceSnapshot: event.resourceSnapshot,
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
          toolFailed ||= status !== "success";
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
              resourceKind: event.resourceKind,
              serverTurnId: event.turnId,
              executionId: event.executionId,
              resourceSnapshot: event.resourceSnapshot,
              databaseResult: event.databaseResult,
              startedAt,
              completedAt,
              durationMs: event.durationMs ?? Math.max(0, completedAt - startedAt),
              outputLength: event.outputLength,
              errorMessage: status !== "success"
                ? event.errorMessage || (resourceKind === 'DB' ? '数据库操作未成功，请查看执行结果。' : "命令执行失败，请查看终端输出。")
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
            ? resourceKind === 'DB' ? '数据库操作已结束，请查看上方执行状态与处理后的结果。' : toolFailed
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
      if (resourceKind === 'DB' && streamBinding.turnId && streamBinding.sessionId) {
        void cancelAndObserveDatabaseTurn(conversation.id, streamBinding.sessionId, streamBinding.backendSessionId, streamBinding.turnId);
      }
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
      if (streamBindings.get(conversation.id) === streamBinding) streamBindings.delete(conversation.id);
      useChatStore.getState().setRunning(conversation.id, resource.id, false);
    }
  }, [activeProfile, target]);

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
    decideCommandApproval,
  };
}
