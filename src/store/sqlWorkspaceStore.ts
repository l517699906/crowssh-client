import { create } from 'zustand'
import type { DbExecution, DbPreparedExecution, DbSession } from '../types/database'

export interface SqlWorkspace {
    session: DbSession
    sql: string
    prepared: { execution: DbPreparedExecution; sql: string } | null
    execution: DbExecution | null
    error: string | null
    unresolvedExecutionId: string | null
    editorHeight: number
}
interface SqlWorkspaceState {
    workspaces: Record<string, SqlWorkspace>
    open: (session: DbSession, draft?: string) => void
    edit: (id: string, sql: string) => void
    update: (id: string, patch: Partial<Omit<SqlWorkspace, 'session'>>) => void
    refreshSession: (session: DbSession) => void
    remove: (id: string) => void
}

/** SQL 和结果仅留当前窗口内存，不保存数据库凭据或恢复旧会话执行权限。 */
export const useSqlWorkspaceStore = create<SqlWorkspaceState>((set) => ({
    workspaces: {},
    open: (session, draft = '') => set((state) => ({ workspaces: {
        ...state.workspaces,
        [session.dbSessionId]: { session, sql: draft, prepared: null, execution: null, error: null, unresolvedExecutionId: null, editorHeight: 240 },
    } })),
    edit: (id, sql) => set((state) => {
        const current = state.workspaces[id]
        return current ? { workspaces: { ...state.workspaces, [id]: { ...current, sql, prepared: null } } } : state
    }),
    update: (id, patch) => set((state) => {
        const current = state.workspaces[id]
        return current ? { workspaces: { ...state.workspaces, [id]: { ...current, ...patch } } } : state
    }),
    refreshSession: (session) => set((state) => {
        const current = state.workspaces[session.dbSessionId]
        if (!current || current.session.sessionGeneration !== session.sessionGeneration) return state
        const changed = current.session.targetContextVersion !== session.targetContextVersion
            || current.session.configVersion !== session.configVersion || session.lifecycleStatus !== 'READY'
        return { workspaces: { ...state.workspaces, [session.dbSessionId]: {
            ...current, session, prepared: changed ? null : current.prepared,
        } } }
    }),
    remove: (id) => set((state) => {
        const { [id]: removed, ...workspaces } = state.workspaces
        return removed ? { workspaces } : state
    }),
}))
