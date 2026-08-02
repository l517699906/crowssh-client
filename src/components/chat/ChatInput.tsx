import { useRef } from "react";
import { BrainCircuit, Send, Square, Terminal } from "lucide-react";

interface Props {
  models: string[];
  model: string;
  onModelChange: (model: string) => void;
  onSend: (text: string) => void | Promise<void>;
  modelSelectDisabled: boolean;
  sendDisabled: boolean;
  text: string;
  setText: (text: string) => void;
  terminalLabel?: string;
  sending: boolean;
  onStop: () => void;
}

export function ChatInput({
  models,
  model,
  onModelChange,
  onSend,
  modelSelectDisabled,
  sendDisabled,
  text,
  setText,
  terminalLabel,
  sending,
  onStop,
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
            <span
              className={`chat-model-select${modelSelectDisabled ? " disabled" : ""}`}
              title={model ? `当前对话模型：${model}` : "未配置 AI 模型"}
            >
              <BrainCircuit size={13} />
              <select
                value={model}
                aria-label="选择当前对话模型"
                disabled={modelSelectDisabled}
                onChange={(event) => onModelChange(event.target.value)}
              >
                {!models.length ? <option value="">未配置模型</option> : null}
                {models.map((modelId) => (
                  <option key={modelId} value={modelId}>{modelId}</option>
                ))}
              </select>
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
            type="button"
            className="chat-send-btn"
            onClick={sending ? onStop : send}
            disabled={!sending && (sendDisabled || !text.trim())}
            title={sending ? "停止" : "发送 (Enter)"}
          >
            {sending ? <Square size={15} fill="currentColor" /> : <Send size={17} />}
          </button>
        </div>
      </div>
    </div>
  );
}
