// ============ SSH 服务器配置 ============
export type AuthType = "password" | "key";

export interface ConnectionOptions {
  connectionTimeout: number;
  keepAliveInterval: number;
  compression: boolean;
  startupCommand?: string;
  strictHostKeyCheck: boolean;
}

export const DEFAULT_CONNECTION_OPTIONS: ConnectionOptions = {
  connectionTimeout: 30,
  keepAliveInterval: 60,
  compression: false,
  strictHostKeyCheck: false,
};

export interface ServerConfig extends ConnectionOptions {
  id: string;
  name: string; // 别名
  host: string;
  port: number;
  username: string;
  authType: AuthType;
  password?: string; // authType === 'password'
  privateKey?: string; // authType === 'key'，PEM 内容
  passphrase?: string; // 私钥口令（可选）
  savePassword?: boolean; // 是否持久化凭据
}

/** 发送给 Rust 后端的认证参数（与 ssh.rs 的 AuthArg 对应） */
export type AuthArg =
  | { type: "password"; password: string }
  | { type: "key"; privateKey: string; passphrase?: string };

// ============ 终端会话 ============
export type SessionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

export interface TerminalSession {
  id: string; // 前端会话/tab id
  serverId: string;
  tabNumber: number;
  title: string;
  status: SessionStatus;
  generation: number;
  backendSessionId?: string; // 服务端终端会话 id，供 AI 工具绑定当前终端
  error?: string;
}

// ============ AI 对话 ============
export type ChatTurnStatus = "running" | "completed" | "error";
export type TranscriptExecutionStatus = "running" | "success" | "error";

interface TranscriptItemBase {
  id: string;
  createdAt: number;
}

export interface AssistantTextItem extends TranscriptItemBase {
  type: "assistant_text";
  content: string;
}

export interface ToolTranscriptItem extends TranscriptItemBase {
  type: "tool";
  toolCallId: string;
  toolName: string;
  command: string;
  status: TranscriptExecutionStatus;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  outputLength?: number;
  errorMessage?: string;
}

export interface StatusTranscriptItem extends TranscriptItemBase {
  type: "status";
  status: TranscriptExecutionStatus;
  content: string;
}

export interface ErrorTranscriptItem extends TranscriptItemBase {
  type: "error";
  content: string;
}

export type TranscriptItem =
  | AssistantTextItem
  | ToolTranscriptItem
  | StatusTranscriptItem
  | ErrorTranscriptItem;

export interface ChatTurn {
  id: string;
  prompt: string;
  status: ChatTurnStatus;
  statusText: string;
  items: TranscriptItem[];
  createdAt: number;
  completedAt?: number;
}

export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  serverSessionId?: string;
  turns: ChatTurn[];
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
}
