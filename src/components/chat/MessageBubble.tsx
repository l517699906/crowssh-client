import { Bot, User } from "lucide-react";
import type { ChatMessage } from "../../types";

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`msg-row ${isUser ? "user" : "ai"}`}>
      {!isUser && (
        <div className="msg-avatar ai">
          <Bot size={15} />
        </div>
      )}
      <div className={`msg-bubble${msg.error ? " error" : ""}`}>
        {msg.content}
        {msg.pending && <span className="typing-caret" />}
      </div>
      {isUser && (
        <div className="msg-avatar user">
          <User size={15} />
        </div>
      )}
    </div>
  );
}
