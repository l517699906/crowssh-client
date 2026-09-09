import { getDeviceIdentity } from '../api/deviceIdentity'
import { mergeSqlHistory, type SqlHistoryEntry } from './sqlHistoryPolicy'
export type { SqlHistoryEntry } from './sqlHistoryPolicy'

interface History { key: string; keepSql: boolean; entries: SqlHistoryEntry[] }
const MAX_AGE = 7 * 24 * 60 * 60 * 1000

function openDatabase(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('crowssh-sql-history', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('history', { keyPath: 'key' })
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(new Error('无法打开查询历史'))
    })
}

/** 清理所有本地作用域，不需要连接服务器或读取设备令牌。 */
export async function pruneSqlHistory(): Promise<void> {
    const database = await openDatabase()
    await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('history', 'readwrite')
        const request = transaction.objectStore('history').openCursor()
        const cutoff = Date.now() - MAX_AGE
        request.onsuccess = () => {
            const cursor = request.result
            if (!cursor) return
            const history = cursor.value as History
            const entries = history.entries.filter((entry) => entry.time >= cutoff).sort((a, b) => b.time - a.time).slice(0, 200)
            if (entries.length !== history.entries.length) cursor.update({ ...history, entries })
            cursor.continue()
        }
        transaction.oncomplete = () => { database.close(); resolve() }
        transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error('查询历史过期清理失败')) }
    })
}

async function transact(connectionId: string, change: (history: History) => History): Promise<History> {
    const { principalId } = await getDeviceIdentity()
    const key = JSON.stringify([principalId, connectionId])
    const database = await openDatabase()
    return new Promise((resolve, reject) => {
        const transaction = database.transaction('history', 'readwrite')
        const store = transaction.objectStore('history')
        const request = store.get(key)
        let result: History
        request.onsuccess = () => {
            const current: History = request.result ?? { key, keepSql: false, entries: [] }
            current.entries = current.entries.filter((entry) => entry.time >= Date.now() - MAX_AGE).slice(0, 200)
            result = change(current)
            store.put(result)
        }
        transaction.oncomplete = () => { database.close(); resolve(result) }
        transaction.onerror = () => { database.close(); reject(new Error('无法保存查询历史')) }
        transaction.onabort = () => { database.close(); reject(new Error('查询历史操作已中断')) }
    })
}

export const readSqlHistory = (connectionId: string) => transact(connectionId, (history) => history)
export const clearSqlHistory = (connectionId: string) => transact(connectionId, (history) => ({ ...history, entries: [] }))
export const setSqlHistoryText = (connectionId: string, keepSql: boolean) => transact(connectionId, (history) => ({
    ...history, keepSql, entries: keepSql ? history.entries : history.entries.map(({ sql: _sql, ...entry }) => entry),
}))
export const recordSqlHistory = (connectionId: string, entry: SqlHistoryEntry) => transact(connectionId, (history) => {
    const old = history.entries.find((item) => item.executionId === entry.executionId)
    const safe = mergeSqlHistory(old, entry, history.keepSql)
    return { ...history, entries: [safe, ...history.entries.filter((item) => item.executionId !== entry.executionId)]
        .filter((item) => item.time >= Date.now() - MAX_AGE).sort((a, b) => b.time - a.time).slice(0, 200) }
})
