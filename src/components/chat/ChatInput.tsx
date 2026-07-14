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
    if (taRef.current) taRef.current.style.height = "auto";
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  return (
    <div className="chat-input-area">
      <div className="chat-toolbar">
        <AgentSelect value={agentId} onChange={onAgentChange} />
      </div>
      <div className="chat-input-row">
        <textarea
          ref={taRef}
          className="textarea chat-textarea"
          rows={1}
          value={text}
          placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          className="btn btn-primary send-btn"
          onClick={send}
          disabled={!text.trim()}
          title="发送"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
