import { memo, useState } from "react";
import {
  ChevronDown,
  CircleCheck,
  CircleX,
  LoaderCircle,
  SquareTerminal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  ChatTurn,
  StatusTranscriptItem,
  ToolTranscriptItem,
  TranscriptExecutionStatus,
} from "../../types";

function formatDuration(durationMs?: number) {
  if (durationMs === undefined) return null;
  if (durationMs < 1000) return `${durationMs} ms`;
  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 1 : 0)} s`;
}

function executionIcon(status: TranscriptExecutionStatus, size = 14) {
  if (status === "running") {
    return <LoaderCircle className="transcript-spinner" size={size} />;
  }
  if (status === "success") {
    return <CircleCheck size={size} />;
  }
  return <CircleX size={size} />;
}

const MarkdownContent = memo(function MarkdownContent({
  content,
  streaming,
}: {
  content: string;
  streaming: boolean;
}) {
  return (
    <div className="transcript-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
      {streaming && <span className="typing-caret" aria-hidden="true" />}
    </div>
  );
});

function StatusEntry({
  item,
  durationMs,
}: {
  item: StatusTranscriptItem;
  durationMs?: number;
}) {
  return (
    <div className={`timeline-item transcript-status-entry ${item.status}`}>
      <span className="timeline-node-icon" aria-hidden="true">
        {executionIcon(item.status)}
      </span>
      <span>{item.content}</span>
      {durationMs !== undefined && item.status !== "running" && (
        <span className="transcript-duration">{formatDuration(durationMs)}</span>
      )}
    </div>
  );
}

function ToolEntry({ item }: { item: ToolTranscriptItem }) {
  const [expanded, setExpanded] = useState(false);
  const command = item.command.trim();
  const duration = formatDuration(item.durationMs);
  const statusLabel = item.status === "running"
    ? "执行中"
    : item.status === "success"
      ? "已完成"
      : "执行失败";

  return (
    <div className={`timeline-item transcript-tool-entry ${item.status}`}>
      <span className="timeline-node-icon" aria-hidden="true">
        {executionIcon(item.status)}
      </span>
      <button
        type="button"
        className="tool-entry-toggle"
        aria-expanded={expanded}
        title={command ? "展开命令详情" : statusLabel}
        disabled={!command}
        onClick={() => setExpanded((current) => !current)}
      >
        <SquareTerminal size={14} aria-hidden="true" />
        <span className="tool-status-label">{statusLabel}</span>
        <span className="tool-command-summary">{command || item.toolName}</span>
        {duration && <span className="tool-duration">{duration}</span>}
        {command && (
          <ChevronDown
            className={`tool-chevron${expanded ? " expanded" : ""}`}
            size={14}
            aria-hidden="true"
          />
        )}
      </button>

      {expanded && command && (
        <div className="tool-command-detail">
          <pre><code>{command}</code></pre>
          {item.outputLength !== undefined && (
            <span>终端输出 {item.outputLength} 字符</span>
          )}
        </div>
      )}

      {item.errorMessage && (
        <div className="tool-error-message">{item.errorMessage}</div>
      )}
    </div>
  );
}

export const TranscriptTurn = memo(function TranscriptTurn({ turn }: { turn: ChatTurn }) {
  let lastTextIndex = -1;
  turn.items.forEach((item, index) => {
    if (item.type === "assistant_text") lastTextIndex = index;
  });
  const durationMs = turn.completedAt === undefined
    ? undefined
    : Math.max(0, turn.completedAt - turn.createdAt);

  return (
    <section className={`transcript-turn ${turn.status}`}>
      <div className="turn-prompt">
        <span className="turn-prompt-marker" aria-hidden="true">›</span>
        <div className="turn-prompt-text">{turn.prompt}</div>
      </div>

      <div className="turn-timeline">
        {turn.items.map((item, index) => {
          if (item.type === "status") {
            return (
              <StatusEntry
                key={item.id}
                item={item}
                durationMs={durationMs}
              />
            );
          }
          if (item.type === "tool") {
            return <ToolEntry key={item.id} item={item} />;
          }
          if (item.type === "error") {
            return (
              <div key={item.id} className="timeline-item transcript-error-entry" role="alert">
                <span className="timeline-node-icon" aria-hidden="true">
                  <CircleX size={14} />
                </span>
                <span>{item.content}</span>
              </div>
            );
          }
          return (
            <div key={item.id} className="timeline-item transcript-text-entry">
              <span className="timeline-text-node" aria-hidden="true" />
              <MarkdownContent
                content={item.content}
                streaming={turn.status === "running" && index === lastTextIndex}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
});
