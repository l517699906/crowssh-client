import { useRef } from "react";
import { Send, Terminal } from "lucide-react";
import { AgentSelect } from "./AgentSelect";
import type { Agent } from "../../types";

interface Props {
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
  onSend: (text: string) => void | Promise<void>;
  disabled: boolean;
  text: string;
  setText: (text: string) => void;
  terminalLabel?: string;
}

export function ChatInput({
  agents,
  agentId,
  onAgentChange,
  onSend,
  disabled,
  text,
  setText,
  terminalLabel,
}: Props) {
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
          <div className="chat-context-controls">
            <AgentSelect value={agentId} agents={agents} onChange={onAgentChange} disabled={disabled} />
            <span
              className={`chat-terminal-binding${terminalLabel ? " connected" : ""}`}
              title={terminalLabel ? `已绑定终端：${terminalLabel}` : "未绑定 SSH 终端"}
            >
              <Terminal size={13} />
              <span>{terminalLabel ?? "未绑定终端"}</span>
            </span>
          </div>
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
