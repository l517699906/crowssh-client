import { useEffect, useRef, useState } from 'react'
import { Activity, ChevronRight, Code2, Database, KeyRound, LoaderCircle, Pencil, Plus, RefreshCw, Table2, Trash2 } from 'lucide-react'
import type { useDbConnections } from '../../hooks/useDbConnections'
import type { useDbSessions } from '../../hooks/useDbSessions'
import type { DbConnectionConfig, DbSchema, DbSession } from '../../types/database'
import * as metadata from '../../api/dbMetadata'
import { useSqlWorkspaceStore } from '../../store/sqlWorkspaceStore'
import { useWorkbenchStore } from '../../store/workbenchStore'

interface Props {
    connections: ReturnType<typeof useDbConnections>
    sessions: ReturnType<typeof useDbSessions>
    activeId: string | null
    onAdd: () => void
    onEdit: (connection: DbConnectionConfig) => void
    onDelete: (connection: DbConnectionConfig) => void
}

function SchemaTree({ sessionId }: { sessionId: string }) {
    const [databases, setDatabases] = useState<string[]>([])
    const [tables, setTables] = useState<Record<string, DbSchema[]>>({})
    const [details, setDetails] = useState<Record<string, DbSchema>>({})
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    const [version, setVersion] = useState(0)
    const loading = useRef(false)
    const requests = useRef<AbortController | null>(null)
    useEffect(() => {
        const controller = new AbortController()
        requests.current = controller
        loading.current = true; setBusy(true); setError(''); setDatabases([]); setTables({}); setDetails({})
        void metadata.listDatabases(sessionId, controller.signal).then((response) => {
            if (controller.signal.aborted) return
            if (response.code === '0000' && response.data) setDatabases(response.data)
            else setError(response.info)
            loading.current = false; setBusy(false)
        })
        return () => { controller.abort() }
    }, [sessionId, version])
    const load = async (database: string, table?: string) => {
        const controller = requests.current
        if (loading.current || !controller || controller.signal.aborted) return
        loading.current = true; setBusy(true); setError('')
        try {
            if (table) {
                const response = await metadata.describeTable(sessionId, database, table, controller.signal)
                if (controller.signal.aborted) return
                if (response.code === '0000' && response.data) setDetails((old) => ({ ...old, [JSON.stringify([database, table])]: response.data! }))
                else setError(response.info)
            } else {
                const response = await metadata.listTables(sessionId, database, controller.signal)
                if (controller.signal.aborted) return
                if (response.code === '0000' && response.data) setTables((old) => ({ ...old, [database]: response.data! }))
                else setError(response.info)
            }
        } finally {
            if (!controller.signal.aborted) { loading.current = false; setBusy(false) }
        }
    }
    const insert = (database: string, table: string) => {
        const quote = (name: string) => '`' + name.replace(/`/g, '``') + '`'
        const store = useSqlWorkspaceStore.getState()
        const workspace = store.workspaces[sessionId]
        if (workspace) store.edit(sessionId, workspace.sql + (workspace.sql ? '\n' : '') + quote(database) + '.' + quote(table))
    }
    return <section className="db-schema" aria-label="数据库结构">
        <div className="db-view-heading"><strong><Database size={13} />数据库结构</strong><button className="icon-btn" disabled={busy} title="刷新数据库结构" aria-label="刷新结构" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={14} className={busy ? 'spin' : undefined} /></button></div>
        {!busy && !error && databases.length === 0 && <p className="db-section-hint">当前账号下没有可见数据库。</p>}
        {busy && <p className="db-message" role="status">读取结构中…</p>}{error && <p className="db-message" role="alert">{error}</p>}
        {databases.map((database) => <details key={database} onToggle={(event) => { if (event.currentTarget.open && !tables[database]) void load(database) }}>
            <summary><ChevronRight size={12} className="db-tree-chevron" /><Database size={13} /><span>{database}</span>{tables[database] && <small>{tables[database].length}</small>}</summary>
            {!tables[database] && <button className="btn" disabled={busy} onClick={() => void load(database)}>加载表</button>}
            {tables[database]?.length === 0 && <p className="db-section-hint">暂无表或视图</p>}
            {tables[database]?.map((table) => <details className="db-schema-table" key={table.name} onToggle={(event) => { event.stopPropagation(); if (event.currentTarget.open && !details[JSON.stringify([database, table.name])]) void load(database, table.name) }}>
                <summary><ChevronRight size={12} className="db-tree-chevron" /><Table2 size={13} /><span>{table.name}</span><small>{table.kind === 'VIEW' ? '视图' : '表'}</small></summary>
                <div className="db-tree-actions"><button className="btn" title="将完整表名插入 SQL 编辑器" onClick={() => insert(database, table.name)}><Code2 size={12} />插入表名</button></div>
                {!details[JSON.stringify([database, table.name])] && <button className="btn" disabled={busy} onClick={() => void load(database, table.name)}>加载字段</button>}
                {details[JSON.stringify([database, table.name])]?.columns.map((column) => <p className="db-schema-column" key={column.ordinal}><span className="db-column-name">{column.keyType === 'PRI' && <KeyRound size={11} />}{column.name}</span> <small>{column.typeName}{column.nullable ? '' : ' NOT NULL'} {column.keyType}</small>{column.indexes?.map((index) => <small key={`${index.name}:${index.position}`} style={{ display: 'block' }}>{index.name} · 第{index.position}列 · {index.unique ? '唯一' : '普通'} · {index.type}</small>)}{!column.indexes && column.indexName && <small style={{ display: 'block' }}>{column.indexName}</small>}</p>)}
            </details>)}
        </details>)}
    </section>
}

const capabilityNames: Record<string, string> = { INSTANCE: '实例指标', PROCESSES: '进程诊断', LOCKS: '锁诊断' }
const capabilityLabels: Record<string, string> = { AVAILABLE: '可用', PERMISSION_DENIED: '权限不足', DISABLED: '采集关闭', UNSUPPORTED: '版本不支持', TEMPORARILY_UNAVAILABLE: '暂时不可用' }

function Capabilities({ session, refresh }: { session: DbSession; refresh: () => Promise<void> }) {
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState('')
    const pending = useRef(false)
    const reload = async () => {
        if (pending.current) return
        pending.current = true; setBusy(true); setError('')
        try {
            const response = await metadata.refreshCapabilities(session.dbSessionId)
            if (response.code !== '0000') setError(response.info)
            else await refresh()
        } finally { pending.current = false; setBusy(false) }
    }
    return <details className="db-capabilities" aria-label="诊断能力">
        <summary><ChevronRight size={12} className="db-tree-chevron" /><Activity size={13} /><strong>诊断能力</strong><span>{Object.values(session.capabilityStates ?? {}).filter((state) => state === 'AVAILABLE').length} 项可用</span></summary>
        <div className="db-view-heading"><span className="db-section-hint">当前账号的采集权限</span><button className="icon-btn" aria-label="刷新诊断能力" disabled={busy || session.consoleLaneStatus !== 'READY'} onClick={() => void reload()}><RefreshCw size={14} /></button></div>
        {Object.entries(capabilityNames).map(([kind, label]) => <div className="db-capability-row" key={kind}><span>{label}</span><span className={session.capabilityStates?.[kind] === 'AVAILABLE' ? 'db-status-ready' : 'db-status-muted'}>{capabilityLabels[session.capabilityStates?.[kind] ?? ''] ?? '未探测'}</span></div>)}
        {busy && <p className="db-message" role="status">重新探测中…</p>}
        {error && <p className="db-message" role="alert">{error}</p>}
    </details>
}

export function DatabaseView({ connections, sessions, activeId, onAdd, onEdit, onDelete }: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const workspace = activeId ? sessions.workspaces[activeId] : undefined
    const session = workspace?.session
    const key = session ? `${session.connectionId}:${session.configVersion}:${session.sessionGeneration}:${session.currentDatabase}:${workspace.execution?.finishedAt}` : ''
    const open = (connection: DbConnectionConfig) => {
        if (sessions.openingIds.includes(connection.connectionId)) return
        const existing = Object.values(sessions.workspaces).find((item) => item.session.connectionId === connection.connectionId && item.session.lifecycleStatus === 'READY')
        if (existing) useWorkbenchStore.getState().open({ id: existing.session.dbSessionId, kind: 'sql' })
        else void sessions.openSession(connection.connectionId)
    }
    return <div className="db-view">
        <div className="panel-header">
            <span className="panel-title"><Database size={14} />数据库</span>
            <div className="panel-actions">
                <button className="icon-btn" title="刷新连接列表" aria-label="刷新连接" disabled={connections.loading} onClick={() => { void connections.refresh(); void sessions.refresh() }}><RefreshCw size={16} className={connections.loading ? 'spin' : undefined} /></button>
                <button className="icon-btn" title="新建 MySQL 连接" aria-label="新建数据库连接" onClick={onAdd}><Plus size={18} /></button>
            </div>
        </div>
        {(connections.error || sessions.error) && <p className="server-error" role="alert">{connections.error || sessions.error}</p>}
        {connections.loading && !connections.connections.length ? <div className="empty-state" role="status"><LoaderCircle size={28} strokeWidth={1.5} className="spin" /><div className="empty-title">正在读取连接列表</div></div>
            : !connections.connections.length ? <div className="empty-state"><Database size={28} strokeWidth={1.5} /><div className="empty-title">还没有数据库连接</div><div className="empty-hint">添加 MySQL 连接，开始查询与管理数据</div><button className="btn btn-primary" onClick={onAdd}><Plus size={14} />新建连接</button></div>
                : <div className="db-sidebar-content">
                    <section className="db-connections" aria-label="已保存的连接">
                        <div className="server-list db-connection-list">
                            {connections.connections.map((connection) => {
                                const opening = sessions.openingIds.includes(connection.connectionId)
                                return <div className={`server-item db-connection-row${(selectedId ?? session?.connectionId) === connection.connectionId ? ' selected' : ''}`} key={connection.connectionId} onClick={() => setSelectedId(connection.connectionId)}>
                                    <button className="db-connection-select" aria-label={`选择连接 ${connection.connectionName}`} aria-pressed={(selectedId ?? session?.connectionId) === connection.connectionId} title="单击选中，双击打开连接" onDoubleClick={() => open(connection)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); open(connection) } }}>
                                        {opening ? <LoaderCircle size={16} className="server-item-icon spin" /> : <Database size={16} className="server-item-icon" />}
                                        <span className="server-info"><span className="server-name">{connection.connectionName}</span><span className="server-addr" title={`${connection.username}@${connection.host}:${connection.port}`}>{connection.username}@{connection.host}:{connection.port}</span></span>
                                    </button>
                                    <div className="server-actions" onDoubleClick={(event) => event.stopPropagation()}>
                                        <button className="icon-btn" title="编辑连接" aria-label={`编辑连接 ${connection.connectionName}`} onClick={() => onEdit(connection)}><Pencil size={14} /></button>
                                        <button className="icon-btn danger" title="删除连接" aria-label={`删除连接 ${connection.connectionName}`} onClick={() => onDelete(connection)}><Trash2 size={14} /></button>
                                    </div>
                                </div>
                            })}
                        </div>
                    </section>
                    {session?.lifecycleStatus === 'READY' ? <section className="db-current-session" aria-label="当前数据库会话">
                        <SchemaTree key={key} sessionId={session.dbSessionId} />
                        <Capabilities key={session.dbSessionId} session={session} refresh={sessions.refresh} />
                    </section> : <div className="db-session-placeholder"><Table2 size={22} strokeWidth={1.5} /><strong>{session ? '连接不可用' : '连接后浏览数据库'}</strong><p>{session ? '重新打开连接以恢复结构浏览，原有 SQL 草稿会保留。' : '打开一个连接，即可查看库表结构并编写 SQL。'}</p></div>}
                </div>}
    </div>
}
