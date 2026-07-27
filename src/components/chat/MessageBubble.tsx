import { Bot, User } from "lucide-react";
import type { ChatMessage } from "../../types";

const FENCED_CODE_PATTERN = /```([\w-]*)\n?([\s\S]*?)```/g;
const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*)/g;

function renderInline(text: string) {
  return text.split(INLINE_PATTERN).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${index}-${part}`}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${index}-${part}`}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function MarkdownContent({ content }: { content: string }) {
  const blocks: React.ReactNode[] = [];
  let offset = 0;

  for (const match of content.matchAll(FENCED_CODE_PATTERN)) {
    if (match.index > offset) {
      blocks.push(
        <span key={`text-${offset}`}>{renderInline(content.slice(offset, match.index))}</span>,
      );
    }
    blocks.push(
      <pre key={`code-${match.index}`}>
        {match[1] ? <div className="code-language">{match[1]}</div> : null}
        <code>{match[2].trim()}</code>
      </pre>,
    );
    offset = match.index + match[0].length;
  }

  if (offset < content.length) {
    blocks.push(<span key={`text-${offset}`}>{renderInline(content.slice(offset))}</span>);
  }

  return blocks;
}

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
        {isUser ? msg.content : <MarkdownContent content={msg.content} />}
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
