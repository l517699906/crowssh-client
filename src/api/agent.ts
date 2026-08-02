import { get, post, postStream } from "./request";
import type { RuntimeModelConfig } from "../types/aiConfig";

export interface AiAgentConfigDTO {
  agentId: string;
  agentName: string;
  agentDesc: string;
}

interface CreateSessionDTO {
  sessionId: string;
}

export interface ChatStreamPayload {
  agentId: string;
  userId: string;
  sessionId: string;
  message: string;
  connectionId: string;
  terminalSessionId?: string;
  runtimeModel: RuntimeModelConfig;
}

interface ChatStreamEventMetadata {
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

export function getAgentConfigs() {
  return get<AiAgentConfigDTO[]>("/api/v1/query_ai_agent_config_list");
}

export function createSession(
  agentId: string,
  userId: string,
  connectionId: string,
  terminalSessionId: string,
) {
  return post<CreateSessionDTO>("/api/v1/create_session", {
    agentId,
    userId,
    connectionId,
    terminalSessionId,
  });
}

function parseStreamLine(line: string): ChatStreamEvent | null {
  const normalized = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!normalized || normalized.startsWith(":")) return null;

  const value = JSON.parse(normalized) as Record<string, unknown>;
  if (!value || typeof value.event !== "string") return null;
  return value as unknown as ChatStreamEvent;
}

export async function* streamChatMessage(
  payload: ChatStreamPayload,
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await postStream("/api/v1/chat_stream", payload, signal);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split(/\r?\n/);
      buffer = done ? "" : lines.pop() ?? "";
      for (const line of lines) {
        const event = parseStreamLine(line);
        if (event) yield event;
      }

      if (done) {
        const event = parseStreamLine(buffer);
        if (event) yield event;
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
