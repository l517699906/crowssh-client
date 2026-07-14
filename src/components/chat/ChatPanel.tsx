import { Sparkles, SquarePen } from "lucide-react";
import { AGENTS, useChat } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import "./chat.css";

export function ChatPanel() {
  const { active, newConversation, setAgent, sendMessage } = useChat();

  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Sparkles size={14} /> AI 助手
        </span>
        <button className="icon-btn" title="新建对话" onClick={newConversation}>
          <SquarePen size={16} />
        </button>
      </div>

      <MessageList messages={active?.messages ?? []} />

      <ChatInput
        agentId={active?.agentId ?? AGENTS[0].id}
        onAgentChange={setAgent}
        onSend={sendMessage}
      />
    </>
  );
}
