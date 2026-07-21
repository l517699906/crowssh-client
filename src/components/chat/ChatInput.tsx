import { useRef, useState } from "react";
import { Send } from "lucide-react";
import { AgentSelect } from "./AgentSelect";

interface Props {
  agentId: string;
  onAgentChange: (id: string) => void;
  onSend: (text: string) => void;
}

export function ChatInput({ agentId, onAgentChange, onSend }: Props) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    if (!text.trim()) return;
    onSend(text);
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
          placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="chat-composer-footer">
          <AgentSelect value={agentId} onChange={onAgentChange} />
          <button
            className="chat-send-btn"
            onClick={send}
            disabled={!text.trim()}
            title="发送 (Enter)"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
