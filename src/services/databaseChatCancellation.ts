import { cancelDatabaseChatStream } from '../api/agent'
import { getExecution } from '../api/dbSession'
import { useChatStore } from '../store/chatStore'
import { mergeDatabaseExecution } from '../lib/databaseExecutionMerge'

const pending = new Map<string, Promise<void>>()

/** 流结束后仍按原轮次查询；绝不重新 prepare 或重发 SQL。 */
export function cancelAndObserveDatabaseTurn(conversationId: string, sessionId: string, dbSessionId: string, serverTurnId: string) {
    const key = JSON.stringify([conversationId, sessionId, dbSessionId, serverTurnId])
    const existing = pending.get(key)
    if (existing) return existing
    const task = (async () => {
        const response = await cancelDatabaseChatStream(sessionId, dbSessionId, serverTurnId)
        const state = useChatStore.getState()
        const conversation = state.conversations.find((item) => item.id === conversationId)
        const knownIds = conversation?.turns.flatMap((turn) => turn.items.flatMap((item) =>
            item.type === 'tool' && item.serverTurnId === serverTurnId && item.executionId ? [item.executionId] : [])) ?? []
        if (response.code !== '0000') state.setError(conversationId, `取消未确认：${response.info}。正在查询原执行状态。`)
        const ids = [...new Set([...knownIds, ...(response.data?.executions.map((item) => item.executionId) ?? [])])]
        await Promise.all(ids.map(async (executionId) => {
            const deadline = Date.now() + 150000
            while (Date.now() < deadline) {
                const result = await getExecution(dbSessionId, executionId)
                const current = useChatStore.getState()
                const chat = current.conversations.find((item) => item.id === conversationId)
                if (!chat) return
                if (result.code !== '0000' || !result.data || result.data.source !== 'AI') {
                    current.setError(conversationId, `执行 ${executionId} 的结果尚未确认：${result.info}。请核查数据库，勿自动重试。`)
                    return
                }
                for (const turn of chat.turns) for (const item of turn.items) {
                    if (item.type !== 'tool' || item.serverTurnId !== serverTurnId || item.executionId !== executionId) continue
                    const merged = mergeDatabaseExecution(item, result.data)
                    if (merged !== item) current.dispatch({ type: 'upsert_tool', conversationId, turnId: turn.id, item: merged })
                }
                if (result.data.state === 'FINISHED') return
                await new Promise((resolve) => setTimeout(resolve, 750))
            }
            useChatStore.getState().setError(conversationId, `执行 ${executionId} 仍未确认终态，请核查数据库；不会自动重试 SQL。`)
        }))
    })().finally(() => pending.delete(key))
    pending.set(key, task)
    return task
}
