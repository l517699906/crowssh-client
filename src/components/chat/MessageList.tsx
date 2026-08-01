import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, MessagesSquare } from "lucide-react";
import type { ChatTurn } from "../../types";
import { TranscriptTurn } from "./MessageBubble";

interface Props {
  turns: ChatTurn[];
}

const BOTTOM_THRESHOLD = 72;

export function MessageList({ turns }: Props) {
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
    return (
      <div className="transcript-shell">
        <div className="empty-state">
          <MessagesSquare size={28} strokeWidth={1.5} />
          <div className="empty-title">开始新的对话</div>
          <div className="empty-hint">选择智能体，在下方输入你的问题</div>
        </div>
      </div>
    );
  }

  return (
    <div className="transcript-shell">
      <div ref={listRef} className="transcript-list" onScroll={updateScrollState}>
        {turns.map((turn) => (
          <TranscriptTurn key={turn.id} turn={turn} />
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
