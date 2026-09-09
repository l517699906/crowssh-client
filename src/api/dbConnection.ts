import { get, post, postWithTimeout } from './request'
import type { ApiResponse } from './request'
import type { DbConnectionConfig, DbConnectionPayload, DbTestResult } from '../types/database'

const BASE = '/api/v1/db'
async function connectionResponse<T>(request: Promise<ApiResponse<T>>): Promise<ApiResponse<T>> {
    const response = await request
    if (response.code === '404') {
        return { ...response, info: '数据库接口不可用（HTTP 404）：请检查服务端版本、数据库功能开关 crowssh.db.enabled 与网关路由。' }
    }
    return response
}

export const listConnections = () => connectionResponse(get<DbConnectionConfig[]>(`${BASE}/connection_list`))
export const getConnection = (connectionId: string) => get<DbConnectionConfig>(`${BASE}/get_connection`, { connectionId })
export const createConnection = (payload: DbConnectionPayload) => connectionResponse(post<DbConnectionConfig>(`${BASE}/create_connection`, payload))
export const updateConnection = (payload: DbConnectionPayload) => connectionResponse(post<DbConnectionConfig>(`${BASE}/update_connection`, payload))
export const deleteConnection = (connectionId: string) => post<void>(`${BASE}/delete_connection`, undefined, { connectionId })
export const testConnection = (payload: DbConnectionPayload) => connectionResponse(postWithTimeout<DbTestResult>(
    `${BASE}/test_connection`, payload, Math.min(30, Math.max(1, payload.connectTimeout ?? 10)) * 1000 + 15000,
))
