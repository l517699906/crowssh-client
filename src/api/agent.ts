import { get, post, postStream } from "./request";
import type { RuntimeModelConfig } from "../types/aiConfig";
import {
  parseChatStreamLine,
  splitChatStreamLines,
  type ChatStreamEvent,
} from "./agentStreamProtocol";

export type { ChatStreamEvent } from "./agentStreamProtocol";

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
  sessionId: string;
  message: string;
  connectionId: string;
  terminalSessionId?: string;
  runtimeModel: RuntimeModelConfig;
}

export type CommandApprovalDecision = "approve" | "deny";

export function getAgentConfigs() {
  return get<AiAgentConfigDTO[]>("/api/v1/query_ai_agent_config_list");
}

export function createSession(
  agentId: string,
  connectionId: string,
  terminalSessionId: string,
) {
  return post<CreateSessionDTO>("/api/v1/create_session", {
    agentId,
    connectionId,
    terminalSessionId,
  });
}

export function decideCommandApproval(
  approvalId: string,
  sessionId: string,
  decision: CommandApprovalDecision,
) {
  return post<void>(`/api/v1/command_approvals/${encodeURIComponent(approvalId)}/decision`, {
    sessionId,
    decision,
  });
}

export function cancelChatStream(sessionId: string, terminalSessionId: string) {
  return post<void>("/api/v1/chat_stream/cancel", { sessionId, terminalSessionId });
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

      const { lines, remainder } = splitChatStreamLines(buffer, done);
      buffer = remainder;
      for (const line of lines) {
        const event = parseChatStreamLine(line);
        if (event) yield event;
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
