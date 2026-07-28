import { useState } from "react";
import { Sparkles, SquarePen } from "lucide-react";
import { useChat } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import type { TerminalSession } from "../../types";
import "./chat.css";

export function ChatPanel({ terminal }: { terminal?: TerminalSession }) {
  const { active, agents, error, loadingAgents, newConversation, setAgent, sendMessage, sending } = useChat(
    terminal?.backendSessionId,
  );
  const [text, setText] = useState("");

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Sparkles size={14} /> AI 助手
        </span>
        <button className="icon-btn" title="新建对话" onClick={newConversation} disabled={!agents.length}>
          <SquarePen size={16} />
        </button>
      </div>

      <MessageList messages={active?.messages ?? []} onPromptSelect={setText} />
      {error && <div className="chat-status" role="alert">{error}</div>}

      <ChatInput
        agents={agents}
        agentId={active?.agentId ?? ""}
        onAgentChange={setAgent}
        onSend={sendMessage}
        disabled={loadingAgents || !agents.length || sending}
        text={text}
        setText={setText}
        terminalLabel={terminal?.backendSessionId ? terminal.title : undefined}
      />
    </>
  );
}
