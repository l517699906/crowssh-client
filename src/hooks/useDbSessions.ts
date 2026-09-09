import { useCallback, useRef, useState } from 'react'
import * as api from '../api/dbSession'
import { useSqlWorkspaceStore } from '../store/sqlWorkspaceStore'
import { useWorkbenchStore } from '../store/workbenchStore'
import { stopConversationStream } from './useChat'
import { useChatStore } from '../store/chatStore'

export function useDbSessions() {
    const pending = useRef(new Map<string, Promise<string | null>>())
    const closing = useRef(new Set<string>())
    const [error, setError] = useState<string | null>(null)
    const [openingIds, setOpeningIds] = useState<string[]>([])
    const workspaces = useSqlWorkspaceStore((state) => state.workspaces)

    const openSession = useCallback((connectionId: string): Promise<string | null> => {
        const existing = pending.current.get(connectionId)
        if (existing) return existing
        const task = (async () => {
            setError(null)
            setOpeningIds((ids) => [...ids, connectionId])
            try {
                const response = await api.openSession(connectionId)
                if (response.code !== '0000' || !response.data) {
                    setError(response.info || '数据库工作台打开失败')
                    return null
                }
                const session = response.data
                useSqlWorkspaceStore.getState().open(session)
                useWorkbenchStore.getState().open({ id: session.dbSessionId, kind: 'sql' })
                return session.dbSessionId
            } finally {
                pending.current.delete(connectionId)
                setOpeningIds((ids) => ids.filter((id) => id !== connectionId))
            }
        })()
        pending.current.set(connectionId, task)
        return task
    }, [])

    /** 事务关闭确认由界面完成；失败时保留草稿与标签供用户核查。 */
    const closeSession = useCallback(async (id: string) => {
        if (closing.current.has(id)) return false
        closing.current.add(id)
        const conversationId = useChatStore.getState().runningByTerminal[id]
        if (conversationId) stopConversationStream(conversationId)
        const workspace = useSqlWorkspaceStore.getState().workspaces[id]
        if (workspace?.session.lifecycleStatus === 'CLOSED') {
            useWorkbenchStore.getState().close(id)
            useChatStore.getState().releaseTerminal(id)
            useSqlWorkspaceStore.getState().remove(id)
            closing.current.delete(id)
            return true
        }
        if (workspace) useSqlWorkspaceStore.getState().refreshSession({ ...workspace.session, lifecycleStatus: 'CLOSING' })
        try {
            const response = await api.closeSession(id)
            if (response.code !== '0000') {
                useSqlWorkspaceStore.getState().update(id, { error: response.info || '会话关闭未确认，请刷新状态' })
                return false
            }
            if (response.data?.lifecycleStatus === 'CLOSING') {
                useSqlWorkspaceStore.getState().update(id, { error: '数据库资源仍在清理，请刷新状态后关闭标签。' })
                return false
            }
            useWorkbenchStore.getState().close(id)
            useChatStore.getState().releaseTerminal(id)
            useSqlWorkspaceStore.getState().remove(id)
            return true
        } finally { closing.current.delete(id) }
    }, [])

    const refresh = useCallback(async () => {
        const response = await api.listSessions()
        if (response.code !== '0000' || !response.data) { setError(response.info); return }
        setError(null)
        const live = new Set(response.data.map((session) => session.dbSessionId))
        const store = useSqlWorkspaceStore.getState()
        for (const session of response.data) store.refreshSession(session)
        for (const workspace of Object.values(store.workspaces)) {
            if (!live.has(workspace.session.dbSessionId)) {
                store.refreshSession({ ...workspace.session, lifecycleStatus: 'CLOSED', consoleLaneStatus: 'CLOSED', aiLaneStatus: 'CLOSED' })
                store.update(workspace.session.dbSessionId, { error: '数据库会话已失效；草稿已保留，请重新打开工作台' })
            }
        }
    }, [])

    return { workspaces, openingIds, error, openSession, closeSession, refresh }
}
