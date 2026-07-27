import { useEffect, useRef } from "react";
import { MessagesSquare } from "lucide-react";
import type { ChatMessage } from "../../types";
import { MessageBubble } from "./MessageBubble";

const QUICK_PROMPTS = ["检查服务器状态", "分析日志文件", "部署应用", "排查报错"];

interface Props {
  messages: ChatMessage[];
  onPromptSelect: (prompt: string) => void;
}

export function MessageList({ messages, onPromptSelect }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        <MessagesSquare size={28} strokeWidth={1.5} />
        <div className="empty-title">开始新的对话</div>
        <div className="empty-hint">选择智能体，在下方输入你的问题</div>
        <div className="quick-prompts">
          {QUICK_PROMPTS.map((prompt) => (
            <button key={prompt} type="button" onClick={() => onPromptSelect(prompt)}>
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="msg-list">
      {messages.map((m) => (
        <MessageBubble key={m.id} msg={m} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
