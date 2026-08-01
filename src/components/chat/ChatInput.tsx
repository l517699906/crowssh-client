import { useRef } from "react";
import { BrainCircuit, Send, Terminal } from "lucide-react";
import { AgentSelect } from "./AgentSelect";
import type { Agent } from "../../types";

interface Props {
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
  onSend: (text: string) => void | Promise<void>;
  agentSelectDisabled: boolean;
  sendDisabled: boolean;
  text: string;
  setText: (text: string) => void;
  terminalLabel?: string;
  modelLabel?: string;
}

export function ChatInput({
  agents,
  agentId,
  onAgentChange,
  onSend,
  agentSelectDisabled,
  sendDisabled,
  text,
  setText,
  terminalLabel,
  modelLabel,
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  const send = () => {
    if (sendDisabled || !text.trim()) return;
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
          placeholder="输入消息，Enter 发送 / Shift+Enter 换行"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="chat-composer-footer">
          <div className="chat-context-controls">
            <AgentSelect
              value={agentId}
              agents={agents}
              onChange={onAgentChange}
              disabled={agentSelectDisabled}
            />
            <span className="chat-model-binding" title={modelLabel ? `当前模型：${modelLabel}` : "未配置 AI 模型"}>
              <BrainCircuit size={13} />
              <span>{modelLabel ?? "未配置模型"}</span>
            </span>
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
            disabled={sendDisabled || !text.trim()}
            title="发送 (Enter)"
          >
            <Send size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}
