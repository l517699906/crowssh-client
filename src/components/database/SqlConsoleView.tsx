import { useEffect, useRef, useState } from 'react'
import { Database, Table2, History, Play, RefreshCw, Square, Trash2, Undo2, Check } from 'lucide-react'
import CodeMirror from '@uiw/react-codemirror'
import { sql, MySQL } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import * as api from '../../api/dbSession'
import { listDatabases } from '../../api/dbMetadata'
import { useSqlWorkspaceStore } from '../../store/sqlWorkspaceStore'
import { selectSqlStatement } from '../../lib/sqlStatementSplit'
import { ResultGrid } from './ResultGrid'
import { recordSqlHistory } from '../../lib/sqlHistory'
import { SqlHistoryPanel } from './SqlHistoryPanel'

const extensions = [sql({ dialect: MySQL }), EditorView.theme({
    '&': { backgroundColor: 'var(--bg-terminal)', color: 'var(--fg)' },
    '.cm-content': { caretColor: 'var(--fg)', fontFamily: 'var(--font-mono)' },
    '.cm-cursor': { borderLeftColor: 'var(--fg)' },
    '.cm-gutters': { backgroundColor: 'var(--bg-terminal)', color: 'var(--fg-disabled)', border: 'none' },
    '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)' },
})]

export function SqlConsoleView({ sessionId, refresh }: { sessionId: string; refresh: () => Promise<void> }) {
    const workspace = useSqlWorkspaceStore((state) => state.workspaces[sessionId])
    const editor = useRef<EditorView | null>(null)
    const drag = useRef<{ y: number; height: number } | null>(null)
    const submitting = useRef(false)
    const [pending, setPending] = useState(false)
    const [pollId, setPollId] = useState<string | null>(null)
    const unresolvedId = workspace?.unresolvedExecutionId ?? null
    const setUnresolvedId = (id: string | null) => useSqlWorkspaceStore.getState().update(sessionId, { unresolvedExecutionId: id })
    const [cancelNotice, setCancelNotice] = useState('')
    const [databases, setDatabases] = useState<string[]>([])
    const [historyOpen, setHistoryOpen] = useState(false)
    const [historyError, setHistoryError] = useState('')
    const store = useSqlWorkspaceStore.getState
    const ready = workspace?.session.lifecycleStatus === 'READY'
    const tlsStatus = workspace?.session.tlsEncrypted === undefined ? 'TLS 状态未提供'
        : !workspace.session.tlsEncrypted ? '连接未加密'
            : workspace.session.tlsIdentityVerified === true ? 'TLS 已加密，服务器身份已验证'
                : workspace.session.tlsIdentityVerified === false ? 'TLS 已加密，服务器身份未验证'
                    : 'TLS 已加密，身份验证状态未提供'
    const busy = pending || unresolvedId !== null || pollId !== null || workspace?.execution?.state === 'RUNNING'

    useEffect(() => {
        const execution = workspace?.execution
        if (!execution || !workspace) return
        void recordSqlHistory(workspace.session.connectionId, { executionId: execution.executionId,
            time: Date.now(), sqlHash: '', status: execution.outcome ?? execution.state,
            durationMillis: execution.result?.totalMillis ?? 0 }).catch(() => setHistoryError('查询历史保存失败，执行结果不受影响。'))
    }, [workspace?.execution, workspace?.session.connectionId])

    useEffect(() => {
        if (!pollId) return
        const controller = new AbortController()
        let timer: ReturnType<typeof setTimeout> | undefined
        const poll = async () => {
            const response = await api.getExecution(sessionId, pollId, controller.signal)
            if (controller.signal.aborted) return
            if (response.code !== '0000' || !response.data) {
                store().update(sessionId, { error: `${response.info}；执行结果尚未确认，请查询原执行 ID，勿自动重试。` })
                setPollId(null)
                return
            }
            store().update(sessionId, { execution: response.data, error: null })
            if (response.data.state === 'FINISHED') {
                setUnresolvedId(null)
                setPollId(null)
                void refresh()
            } else timer = setTimeout(() => void poll(), 750)
        }
        void poll()
        return () => { controller.abort(); if (timer) clearTimeout(timer) }
    }, [pollId, sessionId, refresh])

    const executePrepared = async () => {
        const prepared = store().workspaces[sessionId]?.prepared
        if (!prepared || submitting.current || !ready || busy) return
        submitting.current = true; setPending(true); setCancelNotice('')
        setUnresolvedId(prepared.execution.executionId)
        void recordSqlHistory(workspace!.session.connectionId, { executionId: prepared.execution.executionId,
            time: Date.now(), sqlHash: prepared.execution.sqlHash, status: 'SUBMITTED', durationMillis: 0, sql: prepared.sql })
            .catch(() => setHistoryError('查询历史保存失败，执行结果不受影响。'))
        try {
            const response = await api.executeSql(sessionId, prepared.execution.executionId)
            store().update(sessionId, { prepared: null, error: response.code === '0000' ? null : response.info })
            if (response.data) store().update(sessionId, { execution: response.data })
            if (response.data?.state !== 'FINISHED') setPollId(prepared.execution.executionId)
            else { setUnresolvedId(null); void refresh() }
        } finally { submitting.current = false; setPending(false) }
    }

    const prepare = async (statement?: string) => {
        if (!workspace || !ready || busy || submitting.current) return
        const selection = editor.current?.state.selection.main
        const selected = statement ?? selectSqlStatement(workspace.sql, selection?.anchor ?? 0, selection?.head ?? 0)?.sql
        if (!selected) return
        submitting.current = true; setPending(true)
        try {
            const response = await api.prepareSql(sessionId, selected, workspace.session.targetContextVersion)
            if (response.code !== '0000' || !response.data) { store().update(sessionId, { error: response.info }); return }
            if (response.data.state === 'FINISHED') {
                store().update(sessionId, { error: response.data.reasons.join('；') || '该语句未获准执行', prepared: null })
                return
            }
            const current = store().workspaces[sessionId]
            if (!current || current.sql !== workspace.sql || current.session.targetContextVersion !== workspace.session.targetContextVersion || current.session.lifecycleStatus !== 'READY') {
                store().update(sessionId, { prepared: null, error: '编辑内容或目标已变化，请重新准备执行。' })
                return
            }
            store().update(sessionId, { prepared: { execution: response.data, sql: selected }, error: null })
        } finally { submitting.current = false; setPending(false) }
    }

    const cancel = async () => {
        const id = pollId ?? unresolvedId ?? workspace?.execution?.executionId
        if (!id) return
        const response = await api.cancelExecution(sessionId, id)
        setCancelNotice(response.code === '0000' ? '取消请求已发送，等待最终结果；不代表事务已回滚。' : response.info)
        setPollId(id)
    }

    const changeDatabase = async (database: string) => {
        if (!workspace || !database || busy || submitting.current) return
        submitting.current = true; setPending(true)
        try {
            const response = await api.selectDatabase(sessionId, database, workspace.session.targetContextVersion)
            if (response.code === '0000' && response.data) { store().refreshSession(response.data); store().update(sessionId, { error: null }) }
            else store().update(sessionId, { error: response.info })
        } finally { submitting.current = false; setPending(false) }
    }

    if (!workspace) return null
    return <div className="db-console" onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); void prepare() }
    }}>
        <div className="db-console-header">
            <span className="db-console-title"><Database size={15} />SQL 控制台</span>
            <span className={ready ? 'db-status-ready' : 'db-status-muted'}>{ready ? '已连接' : '会话不可用'}</span>
        </div>
        <div className="db-console-context">
            <label htmlFor={`db-select-${sessionId}`}>当前数据库</label>
            <select id={`db-select-${sessionId}`} aria-label="当前数据库" disabled={!ready || busy} value={workspace.session.currentDatabase ?? ''} onChange={(event) => void changeDatabase(event.target.value)}>
                <option value="">选择数据库</option>
                {[...new Set([workspace.session.currentDatabase, ...databases])].filter((name): name is string => Boolean(name)).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <button className="icon-btn" title="刷新可选数据库" aria-label="加载库列表" disabled={!ready || busy} onClick={async () => {
                if (submitting.current) return
                submitting.current = true; setPending(true)
                try {
                    const response = await listDatabases(sessionId)
                    if (response.code === '0000' && response.data) setDatabases(response.data)
                    else store().update(sessionId, { error: response.info })
                } finally { submitting.current = false; setPending(false) }
            }}><RefreshCw size={14} /></button>
            <button className="btn db-context-refresh" disabled={pending} onClick={() => void refresh()}><RefreshCw size={13} />刷新会话状态</button>
        </div>
        <div className="db-console-toolbar">
          <div className="db-toolbar-group" role="group" aria-label="执行操作">
            <button className="btn btn-primary" disabled={!ready || busy} onClick={() => void prepare()} title="准备当前语句或选中 SQL（⌘/Ctrl+Enter）"><Play size={13} />准备执行</button>
            <button className="btn" disabled={!busy} onClick={() => void cancel()}><Square size={12} />停止</button>
          </div>
          <div className="db-toolbar-group" role="group" aria-label="事务操作">
            <button className="btn" disabled={!ready || busy} onClick={() => void prepare('COMMIT')}><Check size={13} />提交</button>
            <button className="btn" disabled={!ready || busy} onClick={() => void prepare('ROLLBACK')}><Undo2 size={13} />回滚</button>
          </div>
          <div className="db-toolbar-group db-toolbar-secondary" role="group" aria-label="编辑器操作">
            <button className="btn" disabled={pending} onClick={() => store().edit(sessionId, '')}><Trash2 size={13} />清空编辑器</button>
            <button className="btn" aria-pressed={historyOpen} onClick={() => setHistoryOpen((open) => !open)}><History size={13} />历史</button>
          </div>
        </div>
        <div className="db-editor-heading"><span>SQL 编辑器</span><span>选中 SQL 或定位语句 · ⌘/Ctrl+Enter 准备执行</span></div>
        <CodeMirror value={workspace.sql} height={`${workspace.editorHeight}px`} theme="none" extensions={extensions}
            onCreateEditor={(view) => { editor.current = view }}
            onChange={(value) => store().edit(sessionId, value)} />
        <div className="db-editor-splitter" role="separator" tabIndex={0} aria-label="调整 SQL 编辑区高度"
            aria-orientation="horizontal" aria-valuemin={120} aria-valuemax={720} aria-valuenow={workspace.editorHeight}
            onPointerDown={(event) => {
                if (event.button !== 0) return
                event.preventDefault()
                drag.current = { y: event.clientY, height: workspace.editorHeight }
                event.currentTarget.setPointerCapture(event.pointerId)
            }}
            onPointerMove={(event) => {
                if (drag.current) store().update(sessionId, { editorHeight: Math.max(120, Math.min(720, drag.current.height + event.clientY - drag.current.y)) })
            }}
            onPointerUp={(event) => { drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
            onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
            onKeyDown={(event) => {
                if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
                event.preventDefault()
                const height = event.key === 'Home' ? 120 : event.key === 'End' ? 720 : workspace.editorHeight + (event.key === 'ArrowUp' ? -20 : 20)
                store().update(sessionId, { editorHeight: Math.max(120, Math.min(720, height)) })
            }} />
        <div className="db-session-status" aria-label="会话状态">
        <p>MySQL {workspace.session.serverVersion ?? '版本未提供'} · {tlsStatus} · 会话时区：{workspace.session.sessionTimeZone}</p></div>
        {!ready && <p className="db-message" role="status">{workspace.session.lifecycleStatus === 'CLOSING' ? '会话正在清理，请刷新状态确认是否已关闭。'
            : workspace.session.lifecycleStatus === 'OPENING' ? '会话正在连接。'
                : '会话已不可执行，编辑器草稿仍保留；请重新打开数据库工作台。'}</p>}
        {workspace.error && <p className="db-message" role="alert">{workspace.error}</p>}
        {historyError && <p className="db-message" role="status">{historyError}</p>}
        {historyOpen && <SqlHistoryPanel connectionId={workspace.session.connectionId} onClose={() => setHistoryOpen(false)} onInsert={(text) => store().edit(sessionId, text)} />}
        {cancelNotice && <p className="db-message" role="status">{cancelNotice}</p>}
        {workspace.prepared && <div className="db-prepared">
            <strong>确认执行 · {workspace.prepared.execution.riskLevel}</strong>
            <p>目标库：{workspace.prepared.execution.targetDatabase ?? '未选择'} · 配置版本 {workspace.prepared.execution.configVersion}</p>
            <pre>{workspace.prepared.sql}</pre>
            <p>{workspace.prepared.execution.reasons.join('；')}</p>
            <button className="btn" onClick={() => store().update(sessionId, { prepared: null })}>取消准备</button>
            <button className="btn btn-primary" disabled={busy || !ready} onClick={() => void executePrepared()}>执行这条 SQL</button>
        </div>}
        {workspace.execution && <p className="db-message">{workspace.execution.executionId} · {workspace.execution.outcome ?? workspace.execution.state}
            {workspace.execution.outcome === 'OUTCOME_UNKNOWN' && '：无法确认影响，请核查后再决定下一步，禁止自动重试。'}</p>}
        {!pollId && unresolvedId && <button className="btn" onClick={() => setPollId(unresolvedId)}>继续查询执行状态：{unresolvedId}</button>}
        {workspace.execution?.state === 'FINISHED' && workspace.execution.resultAvailable === false && workspace.execution.result &&
            <p className="db-message" role="status">结果明细已从缓存回收，当前仅保留执行摘要。这不表示查询没有数据，也不会自动重新执行 SQL。</p>}
        {!workspace.execution && !workspace.prepared && <div className="db-query-empty"><Table2 size={25} strokeWidth={1.5} /><strong>查询结果将在这里显示</strong><p>编写 SQL → 准备执行 → 确认执行</p></div>}
        {workspace.execution?.result && <ResultGrid key={workspace.execution.executionId} result={workspace.execution.result} />}
    </div>
}
