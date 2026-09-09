import type { ToolTranscriptItem } from '../types'
import type { DbExecution } from '../types/database'

/** 原执行 ID 的终态具有优先级，迟到 RUNNING 快照不能撤回终态。 */
export function mergeDatabaseExecution(item: ToolTranscriptItem, execution: DbExecution): ToolTranscriptItem {
    if (!item.resourceKind?.startsWith('DB') || execution.source !== 'AI' || item.executionId !== execution.executionId) return item
    if (item.databaseResult?.state === 'FINISHED' && execution.state !== 'FINISHED') return item
    const finished = execution.state === 'FINISHED'
    const status = !finished ? 'running' : execution.outcome === 'SUCCEEDED' ? 'success'
        : execution.outcome === 'CANCELLED' ? 'cancelled' : execution.outcome === 'EXPIRED' ? 'expired'
        : execution.outcome === 'REJECTED' ? 'denied' : 'error'
    return {
        ...item, status,
        errorMessage: finished ? execution.outcome === 'OUTCOME_UNKNOWN'
            ? '执行影响尚未确认，请核查原执行 ID，不要自动重试。' : execution.result?.safeError ?? undefined
            : '取消请求已发送，仍在等待执行终态；不代表事务已回滚。',
        databaseResult: {
            executionId: execution.executionId, turnId: item.serverTurnId ?? '', targetDatabase: execution.targetDatabase,
            state: execution.state, outcome: execution.outcome, resultAvailable: execution.resultAvailable,
            reason: execution.policyReason ?? undefined,
            result: execution.result ? { ...execution.result, rows: execution.result.rows.slice(0, 20), previewTruncated: execution.result.rows.length > 20 } : null,
        },
    }
}
