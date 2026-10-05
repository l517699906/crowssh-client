import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Database, MessagesSquare, Terminal } from "lucide-react";
import type { CommandApprovalDecision } from "../../api/agent";
import type { ChatTurn, ToolTranscriptItem } from "../../types";
import { TranscriptTurn } from "./MessageBubble";

interface Props {
  turns: ChatTurn[];
  onApprovalDecision?: (
    item: ToolTranscriptItem,
    decision: CommandApprovalDecision,
  ) => Promise<void>;
  /** 空状态展示的当前绑定资源 */
  context?: { kind: "SSH" | "DB"; label: string };
  /** 点击快捷提问时回填到输入框 */
  onSuggestion?: (text: string) => void;
}

const BOTTOM_THRESHOLD = 72;

const SUGGESTIONS: Record<"SSH" | "DB", string[]> = {
  SSH: ["查看磁盘和内存占用情况", "分析最近的系统错误日志", "列出占用 CPU 最高的进程", "检查正在监听的端口"],
  DB: ["列出当前库的所有表", "说明某张表的结构和索引", "帮我写一条统计查询", "检查慢查询的可能原因"],
};

export function MessageList({ turns, onApprovalDecision, context, onSuggestion }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const followsOutputRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const updateScrollState = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const followsOutput = distanceToBottom <= BOTTOM_THRESHOLD;
    followsOutputRef.current = followsOutput;
    setShowJumpToBottom(!followsOutput);
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    const list = listRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
    followsOutputRef.current = true;
    setShowJumpToBottom(false);
  }, []);

  useEffect(() => {
    if (!followsOutputRef.current) return;
    const frameId = requestAnimationFrame(() => scrollToBottom("auto"));
    return () => cancelAnimationFrame(frameId);
  }, [scrollToBottom, turns]);

  if (turns.length === 0) {
    const suggestions = context ? SUGGESTIONS[context.kind] : [];
    return (
      <div className="transcript-shell">
        <div className="empty-state chat-empty">
          <MessagesSquare size={28} strokeWidth={1.5} />
          <div className="empty-title">开始新的对话</div>
          {context ? (
            <div className="chat-empty-context">
              {context.kind === "DB" ? <Database size={12} aria-hidden="true" /> : <Terminal size={12} aria-hidden="true" />}
              <span>{context.label}</span>
            </div>
          ) : (
            <div className="empty-hint">在下方输入你的问题</div>
          )}
          {onSuggestion && suggestions.length > 0 && (
            <div className="chat-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => onSuggestion(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-shell">
      <div ref={listRef} className="transcript-list" onScroll={updateScrollState}>
        {turns.map((turn) => (
          <TranscriptTurn
            key={turn.id}
            turn={turn}
            onApprovalDecision={onApprovalDecision}
          />
        ))}
      </div>
      {showJumpToBottom && (
        <button
          type="button"
          className="transcript-jump-bottom"
          title="回到底部"
          aria-label="回到底部"
          onClick={() => scrollToBottom("smooth")}
        >
          <ArrowDown size={15} />
        </button>
      )}
    </div>
  );
}
