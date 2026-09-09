import { useState } from 'react'
import type { DbQueryResult } from '../../types/database'
import './database.css'

const PAGE_ROWS = 100
const PAGE_COLUMNS = 20

/** 双向分页限制 DOM 大小，列按位置对应，数值保持服务端字符串精度。 */
export function ResultGrid({ result }: { result: DbQueryResult }) {
    const [rowPage, setRowPage] = useState(0)
    const [columnPage, setColumnPage] = useState(0)
    const [copyStatus, setCopyStatus] = useState('')
    const lastRowPage = Math.max(0, Math.ceil(result.rows.length / PAGE_ROWS) - 1)
    const lastColumnPage = Math.max(0, Math.ceil(result.columns.length / PAGE_COLUMNS) - 1)
    const currentRow = Math.min(rowPage, lastRowPage)
    const currentColumn = Math.min(columnPage, lastColumnPage)
    const rowStart = currentRow * PAGE_ROWS
    const columnStart = currentColumn * PAGE_COLUMNS
    const columns = result.columns.slice(columnStart, columnStart + PAGE_COLUMNS)
    const rows = result.rows.slice(rowStart, rowStart + PAGE_ROWS)

    const copy = async (value: string | null) => {
        try {
            await navigator.clipboard.writeText(value === null ? 'NULL' : value)
            setCopyStatus('单元格已复制')
        } catch { setCopyStatus('无法访问剪贴板，请选中文本后复制') }
    }

    return <section className="db-result" aria-label="SQL 查询结果">
        <div className="db-result-summary">
            <span>{result.rowCount} 行 · {result.executionMillis} ms</span>
            {result.affectedRows != null && <span>影响行数：{result.affectedRows}（{result.affectedRowsSemantics === 'CHANGED_ROWS' ? '实际改变'
                : result.affectedRowsSemantics === 'MATCHED_ROWS' ? '匹配行数' : '统计口径未提供'}）</span>}
            <span role="status">{copyStatus}</span>
        </div>
        {result.safeError && <p className="db-message" role="alert">{result.safeError} · SQLState {result.sqlState ?? '未知'} · {result.vendorCode ?? '未知错误码'}</p>}
        {result.warnings?.length > 0 && <p className="db-message" role="status">数据库警告：{result.warnings.join('；')}</p>}
        {result.truncated && <p className="db-message">结果不完整：{result.truncationReasons.join('、')}。当前显示内容不代表全部结果。</p>}
        {columns.length > 0 ? <div className="db-grid-scroll">
            <table className="db-grid">
                <thead><tr><th scope="col">行</th>{columns.map((column, index) => <th scope="col" key={columnStart + index} title={column.typeName}>
                    {column.label}<small>{column.typeName}</small>
                </th>)}</tr></thead>
                <tbody>{rows.map((row, rowIndex) => <tr key={rowStart + rowIndex}>
                    <th scope="row">{rowStart + rowIndex + 1}</th>
                    {columns.map((_, index) => {
                        const value = row[columnStart + index] ?? null
                        return <td key={columnStart + index}><button type="button" className={`db-cell ${value === null ? 'db-null' : ''}`}
                            title="点击复制单元格" onClick={() => void copy(value)}>{value === null ? 'NULL' : value === '' ? '\u00a0' : value}</button></td>
                    })}
                </tr>)}</tbody>
            </table>
            {rows.length === 0 && <p className="db-message">当前结果没有数据行。</p>}
        </div> : null}
        {(lastRowPage > 0 || lastColumnPage > 0) && <nav className="db-pagination" aria-label="结果分页">
            <button type="button" className="btn" disabled={currentRow === 0} onClick={() => setRowPage(currentRow - 1)}>上一页</button>
            <span>行页 {currentRow + 1} / {lastRowPage + 1}</span>
            <button type="button" className="btn" disabled={currentRow === lastRowPage} onClick={() => setRowPage(currentRow + 1)}>下一页</button>
            {lastColumnPage > 0 && <>
                <button type="button" className="btn" disabled={currentColumn === 0} onClick={() => setColumnPage(currentColumn - 1)}>前一组列</button>
                <span>列 {columnStart + 1}–{Math.min(columnStart + PAGE_COLUMNS, result.columns.length)}</span>
                <button type="button" className="btn" disabled={currentColumn === lastColumnPage} onClick={() => setColumnPage(currentColumn + 1)}>后一组列</button>
            </>}
        </nav>}
    </section>
}
