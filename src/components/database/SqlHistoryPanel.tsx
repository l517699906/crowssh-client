import { useEffect, useState } from 'react'
import { clearSqlHistory, readSqlHistory, setSqlHistoryText, type SqlHistoryEntry } from '../../lib/sqlHistory'

export function SqlHistoryPanel({ connectionId, onInsert, onClose }: { connectionId: string; onInsert: (sql: string) => void; onClose: () => void }) {
    const [entries, setEntries] = useState<SqlHistoryEntry[]>([])
    const [keepSql, setKeepSql] = useState(false)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        let active = true
        void readSqlHistory(connectionId).then((history) => { if (active) { setEntries(history.entries); setKeepSql(history.keepSql) } })
            .catch(() => { if (active) setError('无法读取查询历史') })
        return () => { active = false }
    }, [connectionId])
    return <section className="db-prepared" aria-label="查询历史">
        <div className="db-pagination"><strong>查询历史</strong><button className="btn" onClick={onClose}>关闭</button>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await clearSqlHistory(connectionId); setEntries([]) } catch { setError('清空失败') } finally { setBusy(false) } }}>清空历史</button></div>
        <label><input type="checkbox" checked={keepSql} disabled={busy} onChange={async (event) => {
            const checked = event.target.checked; setBusy(true)
            try { const history = await setSqlHistoryText(connectionId, checked); setKeepSql(history.keepSql); setEntries(history.entries) }
            catch { setError('保存历史设置失败') } finally { setBusy(false) }
        }} />为此连接保存今后执行的 SQL 原文</label>
        <p>默认只保存时间、SQL 哈希、状态和耗时，不保存结果行。最多200条、保留7天；关闭原文保存会移除已有原文。SQL 可能包含业务信息，请按需开启。</p>
        {error && <p role="alert">{error}</p>}
        {entries.map((entry) => <details key={entry.executionId}><summary>{new Date(entry.time).toLocaleString()} · {entry.status} · {entry.durationMillis} ms</summary>
            <p>SQL 哈希：{entry.sqlHash} · 执行 ID：{entry.executionId}</p>{entry.sql && <><pre>{entry.sql}</pre><button className="btn" onClick={() => onInsert(entry.sql!)}>放入编辑器</button></>}
        </details>)}
        {!entries.length && <p>暂无查询历史。</p>}
    </section>
}
