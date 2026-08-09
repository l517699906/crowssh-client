import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, History, Sparkles, SquarePen } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import type { Conversation, ServerConfig, TerminalSession } from "../../types";
import { ChatHistoryPanel } from "./ChatHistoryPanel";
import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import "./chat.css";

type ChatView = "chat" | "history" | "preview";

interface Props {
  terminal?: TerminalSession;
  server?: ServerConfig;
}

export function ChatPanel({ terminal, server }: Props) {
  const {
    active,
    activeId,
    activeProfile,
    agents,
    availableModels,
    conversations,
    decideCommandApproval,
    error,
    hydrated,
    loadingAgents,
    newConversation,
    selectedModel,
    setActiveConversation,
    setModel,
    sendMessage,
    sending,
    stopMessage,
    terminalBusy,
  } = useChat(terminal, server);
  const [view, setView] = useState<ChatView>("chat");
  const [previewConversationId, setPreviewConversationId] = useState<string | null>(null);
  const [draftsByTerminal, setDraftsByTerminal] = useState<Record<string, string>>({});

  const terminalId = terminal?.id;
  const draft = terminalId ? draftsByTerminal[terminalId] ?? "" : "";
  const previewConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === previewConversationId) ?? null,
    [conversations, previewConversationId],
  );

  useEffect(() => {
    setView("chat");
    setPreviewConversationId(null);
  }, [terminalId]);

  useEffect(() => {
    if (view === "preview" && !previewConversation) {
      setView("history");
    }
  }, [previewConversation, view]);

  const setDraft = useCallback((text: string) => {
    if (!terminalId) return;
    setDraftsByTerminal((current) => ({ ...current, [terminalId]: text }));
  }, [terminalId]);

  const handleNewConversation = () => {
    newConversation();
    setPreviewConversationId(null);
    setView("chat");
  };

  const handleHistorySelect = (conversation: Conversation) => {
    if (setActiveConversation(conversation.id)) {
      setPreviewConversationId(null);
      setView("chat");
      return;
    }
    setPreviewConversationId(conversation.id);
    setView("preview");
  };

  const displayedConversation = view === "preview" ? previewConversation : active;
  const title = view === "history" ? "历史记录" : view === "preview" ? "只读预览" : "AI 助手";
  const TitleIcon = view === "history" ? History : view === "preview" ? Eye : Sparkles;
  const canSend = Boolean(
    terminal
    && terminal.status === "connected"
    && terminal.backendSessionId
    && active
    && active.serverId === terminal.serverId,
  );

  return (
    <div className="chat-panel">
      <div className="panel-header">
        <span className="panel-title">
          <TitleIcon size={14} /> {title}
        </span>
        <div className="chat-header-actions">
          {view === "chat" ? (
            <>
              <button
                type="button"
                className="icon-btn"
                title="对话历史"
                aria-label="对话历史"
                onClick={() => setView("history")}
              >
                <History size={16} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="新建对话"
                aria-label="新建对话"
                onClick={handleNewConversation}
                disabled={!terminal || !agents.length || terminalBusy}
              >
                <SquarePen size={16} />
              </button>
            </>
          ) : (
            <button
              type="button"
              className="icon-btn"
              title={view === "preview" ? "返回历史记录" : "返回当前对话"}
              aria-label={view === "preview" ? "返回历史记录" : "返回当前对话"}
              onClick={() => {
                setPreviewConversationId(null);
                setView(view === "preview" ? "history" : "chat");
              }}
            >
              <ArrowLeft size={16} />
            </button>
          )}
        </div>
      </div>

      {view === "history" ? (
        <ChatHistoryPanel
          conversations={conversations}
          currentServerId={terminal?.serverId}
          activeConversationId={activeId}
          hydrated={hydrated}
          onSelect={handleHistorySelect}
        />
      ) : (
        <>
          {view === "preview" && previewConversation && (
            <div className="chat-readonly-notice">
              <Eye size={14} />
              <span>
                来自 {previewConversation.serverLabel}，请切换到该服务器的 SSH 标签页继续对话。
              </span>
            </div>
          )}
          <MessageList
            key={displayedConversation?.id ?? `${view}:empty`}
            turns={displayedConversation?.turns ?? []}
            onApprovalDecision={view === "chat" ? decideCommandApproval : undefined}
          />
          {view === "chat" && error && (
            <div className="chat-status" role="alert">{error}</div>
          )}
          {view === "chat" && (
            <ChatInput
              models={availableModels}
              model={selectedModel}
              onModelChange={setModel}
              onSend={sendMessage}
              modelSelectDisabled={!active || terminalBusy || !availableModels.length}
              sendDisabled={
                loadingAgents
                || !canSend
                || !agents.length
                || !activeProfile
                || terminalBusy
              }
              text={draft}
              setText={setDraft}
              terminalLabel={canSend ? terminal?.title : undefined}
              sending={sending}
              onStop={stopMessage}
            />
          )}
        </>
      )}
    </div>
  );
}
