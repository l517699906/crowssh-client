// SSH 连接信息（前端本地模型）
export interface SSHConnection {
    id: string
    name: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    authType: number       // 1-密码, 2-私钥
    status: number         // 0-未连接, 1-已连接, 2-连接中, 3-连接失败
    createdAt: number
    updatedAt: number
}

// Agent 会话消息
export interface AgentMessage {
    id: string
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: number
}

// Agent 会话
export interface AgentSession {
    id: string
    name: string
    connectionId?: string
    messages: AgentMessage[]
    createdAt: number
}

// 服务器状态
export interface ServerStatus {
    connected: boolean
    url: string
    version?: string
}

// ===== SSH 连接状态枚举 =====
export const ConnectionStatus = {
    DISCONNECTED: 0,
    CONNECTED: 1,
    CONNECTING: 2,
    FAILED: 3,
} as const

export const AuthType = {
    PASSWORD: 1,
    PRIVATE_KEY: 2,
} as const
