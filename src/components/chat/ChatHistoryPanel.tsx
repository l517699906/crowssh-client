import { useEffect, useMemo, useState } from "react";
import { Clock3, Eye, History, LoaderCircle, Search } from "lucide-react";
import type { Conversation } from "../../types";

interface Props {
  conversations: Conversation[];
  currentServerId?: string;
  activeConversationId: string | null;
  hydrated: boolean;
  onSelect: (conversation: Conversation) => void;
}

type HistoryScope = "current" | "all";
type HistoryGroup = "今天" | "昨天" | "更早";

function groupFor(timestamp: number): HistoryGroup {
  const value = new Date(timestamp);
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (value.getTime() >= startOfToday) return "今天";
  if (value.getTime() >= startOfYesterday) return "昨天";
  return "更早";
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (groupFor(timestamp) === "今天") {
    return new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function conversationStatus(conversation: Conversation): "idle" | "running" | "success" | "error" {
  const lastTurn = conversation.turns[conversation.turns.length - 1];
  if (!lastTurn) return "idle";
  if (lastTurn.status === "running") return "running";
  return lastTurn.status === "completed" ? "success" : "error";
}

export function ChatHistoryPanel({
  conversations,
  currentServerId,
  activeConversationId,
  hydrated,
  onSelect,
}: Props) {
  const [scope, setScope] = useState<HistoryScope>(currentServerId ? "current" : "all");
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    setScope(currentServerId ? "current" : "all");
  }, [currentServerId]);

  const groups = useMemo(() => {
    const result = new Map<HistoryGroup, Conversation[]>();
    conversations
      .filter((conversation) =>
        (scope === "all" || conversation.serverId === currentServerId)
        && (!normalizedQuery
          || conversation.title.toLocaleLowerCase().includes(normalizedQuery)
          || conversation.serverLabel.toLocaleLowerCase().includes(normalizedQuery)),
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach((conversation) => {
        const group = groupFor(conversation.updatedAt);
        result.set(group, [...(result.get(group) ?? []), conversation]);
      });
    return result;
  }, [conversations, currentServerId, normalizedQuery, scope]);

  return (
    <section className="chat-history" aria-label="对话历史">
      <div className="chat-history-toolbar">
        {currentServerId && (
          <div className="chat-history-scope" role="group" aria-label="历史记录范围">
            <button
              type="button"
              className={scope === "current" ? "active" : ""}
              onClick={() => setScope("current")}
            >
              当前服务器
            </button>
            <button
              type="button"
              className={scope === "all" ? "active" : ""}
              onClick={() => setScope("all")}
            >
              全部
            </button>
          </div>
        )}
        <label className="chat-history-search">
          <Search size={14} />
          <input
            value={query}
            placeholder="搜索对话"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      {!hydrated ? (
        <div className="chat-history-empty">
          <LoaderCircle className="transcript-spinner" size={18} />
          <span>正在读取历史记录</span>
        </div>
      ) : groups.size === 0 ? (
        <div className="chat-history-empty">
          <History size={24} strokeWidth={1.5} />
          <span>{normalizedQuery ? "没有匹配的对话" : "暂无历史记录"}</span>
        </div>
      ) : (
        <div className="chat-history-list">
          {[...groups.entries()].map(([group, items]) => (
            <div className="chat-history-group" key={group}>
              <div className="chat-history-group-title">{group}</div>
              {items.map((conversation) => {
                const isCurrentServer = conversation.serverId === currentServerId;
                const status = conversationStatus(conversation);
                return (
                  <button
                    type="button"
                    className={`chat-history-item${conversation.id === activeConversationId ? " active" : ""}`}
                    key={conversation.id}
                    aria-current={conversation.id === activeConversationId ? "page" : undefined}
                    onClick={() => onSelect(conversation)}
                  >
                    <span className={`chat-history-status ${status}`} />
                    <span className="chat-history-content">
                      <span className="chat-history-title">{conversation.title}</span>
                      <span className="chat-history-meta">
                        <span>{conversation.serverLabel}</span>
                        <span>{conversation.turns.length} 轮</span>
                      </span>
                    </span>
                    <span className="chat-history-aside">
                      {!isCurrentServer && <Eye size={13} aria-label="只读查看" />}
                      <span><Clock3 size={11} />{formatTime(conversation.updatedAt)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
