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
  resourceKind?: 'SSH' | 'DB';
}

interface CreateSessionDTO {
  sessionId: string;
}

interface ChatStreamBase {
  agentId: string;
  sessionId: string;
  message: string;
  runtimeModel: RuntimeModelConfig;
}
export type ChatStreamPayload = ChatStreamBase & (
  | { connectionId: string; terminalSessionId: string; dbConnectionId?: never; dbSessionId?: never }
  | { dbConnectionId: string; dbSessionId: string; supportsDbApproval: true; connectionId?: never; terminalSessionId?: never }
);

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

export function createDatabaseSession(agentId: string, dbConnectionId: string, dbSessionId: string) {
  return post<CreateSessionDTO>('/api/v1/create_session', { agentId, dbConnectionId, dbSessionId });
}

export interface ChatCancelResult {
  streamState: 'CANCEL_REQUESTED' | 'NOT_ACTIVE';
  executions: { executionId: string; state: import('../types/database').DbExecutionState; outcome: import('../types/database').DbOutcome | null; cancelRequested: boolean }[];
}
export function cancelDatabaseChatStream(sessionId: string, dbSessionId: string, turnId: string) {
  return post<ChatCancelResult>('/api/v1/chat_stream/cancel', { sessionId, dbSessionId, turnId });
}

export function decideDatabaseApproval(approvalId: string, sessionId: string, turnId: string, decision: CommandApprovalDecision) {
  return post<string>(`/api/v1/db/approvals/${encodeURIComponent(approvalId)}/decision`, { sessionId, turnId, decision });
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
