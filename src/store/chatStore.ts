import { create } from "zustand";
import { uid } from "../lib/storage";
import type {
  AssistantTextItem,
  ChatTurn,
  Conversation,
  ErrorTranscriptItem,
  StatusTranscriptItem,
  ToolTranscriptItem,
} from "../types";

export type ConversationAction =
  | { type: "reset_sessions" }
  | { type: "set_agent"; conversationId: string; agentId: string }
  | {
      type: "set_model";
      conversationId: string;
      selection?: Conversation["modelSelection"];
    }
  | {
      type: "set_session";
      conversationId: string;
      sessionId: string;
      terminalSessionId?: string;
      dbSessionId?: string;
    }
  | { type: "clear_session"; conversationId: string }
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

interface CreateConversationInput {
  agentId: string;
  serverId: string;
  serverLabel: string;
  terminalId: string;
  resourceKind?: 'SSH' | 'DB';
  dbConnectionId?: string;
}

interface ChatStore {
  hydrated: boolean;
  conversations: Conversation[];
  activeByTerminal: Record<string, string>;
  runningByConversation: Record<string, boolean>;
  runningByTerminal: Record<string, string>;
  errorsByConversation: Record<string, string | null>;
  hydrate: (conversations: Conversation[]) => void;
  reconcileAgents: (availableAgentIds: string[], fallbackAgentId: string, resourceKind?: 'SSH' | 'DB') => void;
  resetSessions: () => void;
  ensureConversation: (input: CreateConversationInput) => string;
  createConversation: (input: CreateConversationInput) => string;
  bindConversation: (terminalId: string, conversationId: string) => void;
  releaseTerminal: (terminalId: string) => void;
  dispatch: (action: ConversationAction) => void;
  setRunning: (conversationId: string, terminalId: string, running: boolean) => void;
  setError: (conversationId: string, error: string | null) => void;
}

function updateTurn(
  conversations: Conversation[],
  conversationId: string,
  turnId: string,
  update: (turn: ChatTurn) => ChatTurn,
  updatedAt?: number,
) {
  return conversations.map((conversation) =>
    conversation.id !== conversationId
      ? conversation
      : {
          ...conversation,
          updatedAt: updatedAt ?? conversation.updatedAt,
          turns: conversation.turns.map((turn) => (turn.id === turnId ? update(turn) : turn)),
        },
  );
}

function reduceConversations(
  conversations: Conversation[],
  action: ConversationAction,
): Conversation[] {
  switch (action.type) {
    case "reset_sessions":
      return conversations.map((conversation) => ({
        ...conversation,
        serverSessionId: undefined,
        terminalSessionId: undefined,
        dbSessionId: undefined,
      }));
    case "set_agent":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              agentId: action.agentId,
              serverSessionId: undefined,
              terminalSessionId: undefined,
              dbSessionId: undefined,
              updatedAt: Date.now(),
            }
          : conversation,
      );
    case "set_model":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              modelSelection: action.selection,
              updatedAt: Date.now(),
            }
          : conversation,
      );
    case "set_session":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              serverSessionId: action.sessionId,
              terminalSessionId: action.terminalSessionId,
              dbSessionId: action.dbSessionId,
            }
          : conversation,
      );
    case "clear_session":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              serverSessionId: undefined,
              terminalSessionId: undefined,
              dbSessionId: undefined,
            }
          : conversation,
      );
    case "start_turn":
      return conversations.map((conversation) =>
        conversation.id === action.conversationId
          ? {
              ...conversation,
              title: conversation.turns.length === 0
                ? action.turn.prompt.slice(0, 28)
                : conversation.title,
              turns: [...conversation.turns, action.turn],
              updatedAt: action.turn.createdAt,
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
          statusText: action.item.status === "approval_required"
            ? "等待执行确认"
            : action.item.status === "running"
              ? "正在执行工具"
              : turn.statusText,
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
      return updateTurn(
        conversations,
        action.conversationId,
        action.turnId,
        (turn) => ({
          ...turn,
          status: "completed",
          statusText: "处理完成",
          completedAt: action.completedAt,
          items: turn.items.map((item) =>
            item.id === action.statusItemId && item.type === "status"
              ? { ...item, status: "success", content: "处理完成" }
              : item,
          ),
        }),
        action.completedAt,
      );
    case "fail_turn":
      return updateTurn(
        conversations,
        action.conversationId,
        action.turnId,
        (turn) => ({
          ...turn,
          status: "error",
          statusText: action.item.content === "已停止处理" ? "已停止" : "处理失败",
          completedAt: action.completedAt,
          items: [
            ...turn.items.map((item) =>
              item.id === action.statusItemId && item.type === "status"
                ? {
                    ...item,
                    status: "error" as const,
                    content: action.item.content === "已停止处理" ? "已停止" : "处理失败",
                  }
                : item.type === "tool"
                    && (item.status === "approval_required" || item.status === "running")
                  ? {
                      ...item,
                      status: item.resourceKind?.startsWith('DB') ? "error" as const : "cancelled" as const,
                      completedAt: action.completedAt,
                      durationMs: Math.max(0, action.completedAt - item.startedAt),
                      errorMessage: item.resourceKind?.startsWith('DB') ? "对话已结束，数据库执行结果尚未确认；请核查原执行 ID，不要自动重试。" : "命令执行已取消。",
                    }
                  : item,
            ),
            action.item,
          ],
        }),
        action.completedAt,
      );
    default:
      return conversations;
  }
}

function makeConversation(input: CreateConversationInput): Conversation {
  const now = Date.now();
  return {
    id: uid(),
    title: "新对话",
    agentId: input.agentId,
    serverId: input.serverId,
    serverLabel: input.serverLabel,
    resourceKind: input.resourceKind ?? 'SSH',
    dbConnectionId: input.resourceKind === 'DB' ? input.dbConnectionId : undefined,
    turns: [],
    createdAt: now,
    updatedAt: now,
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  hydrated: false,
  conversations: [],
  activeByTerminal: {},
  runningByConversation: {},
  runningByTerminal: {},
  errorsByConversation: {},
  hydrate: (loaded) =>
    set((state) => {
      const existingIds = new Set(state.conversations.map((item) => item.id));
      const merged = [
        ...state.conversations,
        ...loaded.filter((item) => !existingIds.has(item.id)),
      ].sort((a, b) => b.updatedAt - a.updatedAt);
      return { hydrated: true, conversations: merged };
    }),
  reconcileAgents: (availableAgentIds, fallbackAgentId, resourceKind = 'SSH') => {
    const available = new Set(availableAgentIds);
    set((state) => ({
      conversations: state.conversations.map((conversation) =>
        (conversation.resourceKind ?? 'SSH') !== resourceKind || available.has(conversation.agentId)
          ? conversation
          : {
              ...conversation,
              agentId: fallbackAgentId,
              serverSessionId: undefined,
              terminalSessionId: undefined,
              dbSessionId: undefined,
            },
      ),
    }));
  },
  resetSessions: () =>
    set((state) => ({
      conversations: reduceConversations(state.conversations, { type: "reset_sessions" }),
    })),
  ensureConversation: (input) => {
    const state = get();
    const activeId = state.activeByTerminal[input.terminalId];
    const active = state.conversations.find((item) => item.id === activeId);
    if (active?.serverId === input.serverId && (active.resourceKind ?? 'SSH') === (input.resourceKind ?? 'SSH')) return active.id;
    return get().createConversation(input);
  },
  createConversation: (input) => {
    const conversation = makeConversation(input);
    set((state) => ({
      conversations: [conversation, ...state.conversations],
      activeByTerminal: {
        ...state.activeByTerminal,
        [input.terminalId]: conversation.id,
      },
    }));
    return conversation.id;
  },
  bindConversation: (terminalId, conversationId) =>
    set((state) => {
      const activeByTerminal = Object.fromEntries(
        Object.entries(state.activeByTerminal).filter(
          ([boundTerminalId, boundConversationId]) =>
            boundTerminalId === terminalId || boundConversationId !== conversationId,
        ),
      );
      return {
        activeByTerminal: { ...activeByTerminal, [terminalId]: conversationId },
      };
    }),
  releaseTerminal: (terminalId) =>
    set((state) => {
      if (!state.activeByTerminal[terminalId] && !state.runningByTerminal[terminalId]) {
        return state;
      }
      const { [terminalId]: _active, ...activeByTerminal } = state.activeByTerminal;
      const { [terminalId]: _running, ...runningByTerminal } = state.runningByTerminal;
      return { activeByTerminal, runningByTerminal };
    }),
  dispatch: (action) =>
    set((state) => ({
      conversations: reduceConversations(state.conversations, action),
    })),
  setRunning: (conversationId, terminalId, running) =>
    set((state) => {
      const runningByConversation = { ...state.runningByConversation };
      const runningByTerminal = { ...state.runningByTerminal };
      if (running) {
        runningByConversation[conversationId] = true;
        runningByTerminal[terminalId] = conversationId;
      } else {
        delete runningByConversation[conversationId];
        if (runningByTerminal[terminalId] === conversationId) {
          delete runningByTerminal[terminalId];
        }
      }
      return { runningByConversation, runningByTerminal };
    }),
  setError: (conversationId, error) =>
    set((state) => ({
      errorsByConversation: {
        ...state.errorsByConversation,
        [conversationId]: error,
      },
    })),
}));
