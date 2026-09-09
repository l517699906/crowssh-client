import { get, getWithTimeout, post, postWithTimeout } from './request'
import type { DbCancelResult, DbExecution, DbPreparedExecution, DbSession } from '../types/database'

const BASE = '/api/v1/db/session'
export const openSession = (connectionId: string) => postWithTimeout<DbSession>(`${BASE}/open`, { connectionId }, 45000)
export const listSessions = () => get<DbSession[]>(`${BASE}/list`)
export const prepareSql = (dbSessionId: string, sql: string, expectedTargetContextVersion: number) =>
    post<DbPreparedExecution>(`${BASE}/prepare`, { dbSessionId, sql, expectedTargetContextVersion })
/** execute 响应丢失后只查询同一 ID，调用方不得重新 prepare 后自动重试。 */
export const executeSql = (dbSessionId: string, executionId: string) => post<DbExecution>(`${BASE}/execute`, { dbSessionId, executionId })
export const cancelExecution = (dbSessionId: string, executionId: string) => post<DbCancelResult>(`${BASE}/cancel`, { dbSessionId, executionId })
export const getExecution = (dbSessionId: string, executionId: string, signal?: AbortSignal) =>
    getWithTimeout<DbExecution>(`${BASE}/execution`, { dbSessionId, executionId }, 10000, signal)
export const selectDatabase = (dbSessionId: string, database: string, expectedTargetContextVersion: number) =>
    post<DbSession>(`${BASE}/select_database`, { dbSessionId, database, expectedTargetContextVersion })
export const closeSession = (dbSessionId: string) => post<{ dbSessionId: string; lifecycleStatus: 'CLOSING' | 'CLOSED' }>(`${BASE}/close`, { dbSessionId })
