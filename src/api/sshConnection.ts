/**
 * SSH 连接管理 API
 */
import { get, post, postWithTimeout } from './request'

// ===== 类型定义 =====

/** SSH 连接响应 DTO（与后端 SshConnectionResponseDTO 对齐） */
export interface SshConnectionDTO {
    connectionId: string
    connectionName: string
    host: string
    port: number
    username: string
    authType: number     // 1-密码, 2-私钥
    status: number       // 0-未连接, 1-已连接, 2-连接中, 3-连接失败
    encrypted: number
    userId: string
    createdAt: string
    updatedAt: string
    connectTimeout?: number
    keepaliveInterval?: number
    startupCommand?: string
    compression?: boolean
    strictHostKeyCheck?: boolean
}

/** 创建/更新连接请求体 */
export interface SshConnectionPayload {
    connectionId?: string
    connectionName: string
    host: string
    port: number
    username: string
    authType: number
    password?: string
    privateKey?: string
    userId?: string
    connectTimeout?: number
    keepaliveInterval?: number
    startupCommand?: string
    compression?: boolean
    strictHostKeyCheck?: boolean
}

// ===== API 方法 =====

const BASE = '/api/v1/ssh'

/** 创建 SSH 连接 */
export function createConnection(payload: SshConnectionPayload) {
    return post<SshConnectionDTO>(`${BASE}/create_connection`, payload)
}

/** 更新 SSH 连接 */
export function updateConnection(payload: SshConnectionPayload) {
    return post<SshConnectionDTO>(`${BASE}/update_connection`, payload)
}

/** 删除 SSH 连接（POST + @RequestParam connectionId） */
export function deleteConnection(connectionId: string) {
    return post<void>(`${BASE}/delete_connection`, undefined, { connectionId })
}

/** 查询单个连接 */
export function getConnection(connectionId: string) {
    return get<SshConnectionDTO>(`${BASE}/get_connection`, { connectionId })
}

/** 查询连接列表 */
export function getConnectionList(userId = 'default') {
    return get<SshConnectionDTO[]>(`${BASE}/connection_list`, { userId })
}

/** 使用服务端实际网络环境测试 SSH 连接，不保存连接 */
export function testConnection(payload: SshConnectionPayload) {
    const connectTimeoutMs = Math.max(1, payload.connectTimeout ?? 30) * 1000
    return postWithTimeout<void>(`${BASE}/test_connection`, payload, connectTimeoutMs + 5000)
}

/** 建立 SSH 连接 */
export function connect(connectionId: string) {
    return post<void>(`${BASE}/connect`, undefined, { connectionId })
}

/** 断开 SSH 连接 */
export function disconnect(connectionId: string) {
    return post<void>(`${BASE}/disconnect`, undefined, { connectionId })
}
