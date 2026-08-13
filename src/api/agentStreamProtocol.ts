export interface ChatStreamEventMetadata {
  schemaVersion?: number;
  eventId?: string;
  sequence?: number;
  timestamp?: number;
  sessionId?: string;
}

export type ChatStreamEvent = ChatStreamEventMetadata & (
  | { event: "status"; content: string; status: string }
  | { event: "text"; content: string; fullText?: string }
  | {
      event: "tool_approval_required";
      toolCallId: string;
      toolName: string;
      command: string;
      status: "approval_required";
      approvalId: string;
      riskLevel?: string;
      startedAt?: number;
    }
  | {
      event: "tool_call";
      toolCallId: string;
      toolName: string;
      command?: string;
      status: string;
      startedAt?: number;
    }
  | {
      event: "tool_result";
      toolCallId: string;
      toolName?: string;
      command?: string;
      content?: string;
      status: string;
      startedAt?: number;
      completedAt?: number;
      durationMs?: number;
      outputLength?: number;
      errorMessage?: string;
    }
  | { event: "done"; content: string; stopReason?: string }
  | { event: "error"; content: string; code?: string; retryable?: boolean }
);

export function parseChatStreamLine(line: string): ChatStreamEvent | null {
  const normalized = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!normalized || normalized.startsWith(":")) return null;

  const value = JSON.parse(normalized) as Record<string, unknown>;
  if (!value || typeof value.event !== "string") return null;
  return value as unknown as ChatStreamEvent;
}

export function splitChatStreamLines(buffer: string, done: boolean) {
  const lines = buffer.split(/\r?\n/);
  const remainder = done ? "" : lines.pop() ?? "";
  return { lines, remainder };
}
