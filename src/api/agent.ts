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
  terminalSessionId?: string;
  runtimeModel: RuntimeModelConfig;
}

export type ChatStreamEvent =
  | { event: "text"; content: string; fullText?: string }
  | { event: "tool_call"; toolCallId: string; toolName: string; status: string }
  | { event: "tool_result"; toolCallId: string; content: string; status: string }
  | { event: "done"; content: string }
  | { event: "error"; content: string };

export function getAgentConfigs() {
  return get<AiAgentConfigDTO[]>("/api/v1/query_ai_agent_config_list");
}

export function createSession(agentId: string, userId: string) {
  return post<CreateSessionDTO>("/api/v1/create_session", { agentId, userId });
}

function parseStreamLine(line: string): ChatStreamEvent | null {
  const normalized = line.startsWith("data:") ? line.slice(5).trim() : line.trim();
  if (!normalized || normalized.startsWith(":")) return null;

  const value = JSON.parse(normalized) as Partial<ChatStreamEvent>;
  if (typeof value.event !== "string") return null;
  return value as ChatStreamEvent;
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
