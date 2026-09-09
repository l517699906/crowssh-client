export interface SqlHistoryEntry { executionId: string; time: number; sqlHash: string; status: string; durationMillis: number; sql?: string }
const pendingStates = new Set(['SUBMITTED', 'PREPARED', 'WAITING_APPROVAL', 'RUNNING'])

export function mergeSqlHistory(old: SqlHistoryEntry | undefined, entry: SqlHistoryEntry, keepSql: boolean): SqlHistoryEntry {
    const text = entry.sql ?? old?.sql
    // 保守排除账号/口令管理及可疑凭据文本；显式投影，不存错误内容和结果行。
    const sql = keepSql && text && !/password|identified|credential|secret|token|private[ _-]?key|\b(create|alter|drop)\s+user\b|\bgrant\b|\brevoke\b/i.test(text) ? text : undefined
    const preserveStatus = old && ((!pendingStates.has(old.status) && pendingStates.has(entry.status))
        || (old.status === 'RUNNING' && entry.status === 'SUBMITTED'))
    return { executionId: entry.executionId, time: Math.min(old?.time ?? entry.time, entry.time),
        sqlHash: entry.sqlHash || old?.sqlHash || '', status: preserveStatus ? old.status : entry.status,
        durationMillis: preserveStatus ? old.durationMillis : entry.durationMillis, sql }
}
