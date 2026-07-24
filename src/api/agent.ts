import { get, post } from "./request";

export interface AiAgentConfigDTO {
  agentId: string;
  agentName: string;
  agentDesc: string;
}

interface CreateSessionDTO {
  sessionId: string;
}

interface ChatDTO {
  content: string;
}

export function getAgentConfigs() {
  return get<AiAgentConfigDTO[]>("/api/v1/query_ai_agent_config_list");
}

export function createSession(agentId: string, userId: string) {
  return post<CreateSessionDTO>("/api/v1/create_session", { agentId, userId });
}

export function sendChatMessage(payload: {
  agentId: string;
  userId: string;
  sessionId: string;
  message: string;
}) {
  return post<ChatDTO>("/api/v1/chat", payload);
}
