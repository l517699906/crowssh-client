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
  id: string; // 会话/tab id（= 后端 session_id）
  serverId: string;
  title: string;
  status: SessionStatus;
  generation: number;
  error?: string;
}

// ============ AI 对话 ============
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  pending?: boolean; // AI 回复生成中
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  agentId: string;
  serverSessionId?: string;
  messages: ChatMessage[];
  createdAt: number;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
}
