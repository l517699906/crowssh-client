import { getWithTimeout, post } from './request'
import type { DbSchema } from '../types/database'

const BASE = '/api/v1/db/metadata'
export const listDatabases = (dbSessionId: string, signal?: AbortSignal) =>
    getWithTimeout<string[]>(`${BASE}/databases`, { dbSessionId }, 150000, signal)
export const listTables = (dbSessionId: string, database: string, signal?: AbortSignal) =>
    getWithTimeout<DbSchema[]>(`${BASE}/tables`, { dbSessionId, database }, 150000, signal)
export const describeTable = (dbSessionId: string, database: string, table: string, signal?: AbortSignal) =>
    getWithTimeout<DbSchema>(`${BASE}/table`, { dbSessionId, database, table }, 150000, signal)

export const refreshCapabilities = (dbSessionId: string) =>
    post<Record<string, string>>(`${BASE}/refresh_capabilities`, {}, { dbSessionId })
