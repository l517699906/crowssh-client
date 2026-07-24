import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { AgentSelect } from "./AgentSelect";
import type { Agent } from "../../types";

interface Props {
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
  onSend: (text: string) => void | Promise<void>;
  disabled: boolean;
}

export function ChatInput({ agents, agentId, onAgentChange, onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    if (!text.trim()) return;
    void onSend(text);
    setText("");
    taRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-input-area">
      <div className="chat-composer">
        <textarea
          ref={taRef}
          className="chat-textarea"
          value={text}
          placeholder={disabled ? "正在连接智能体" : "输入消息，Enter 发送 / Shift+Enter 换行"}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="chat-composer-footer">
          <AgentSelect value={agentId} agents={agents} onChange={onAgentChange} disabled={disabled} />
          <button
            className="chat-send-btn"
            onClick={send}
            disabled={disabled || !text.trim()}
            title="发送 (Enter)"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
