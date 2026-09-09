import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api/dbConnection'
import type { DbConnectionConfig, DbConnectionPayload } from '../types/database'

export function useDbConnections() {
    const [connections, setConnections] = useState<DbConnectionConfig[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const revision = useRef(0)
    const refresh = useCallback(async () => {
        const request = ++revision.current
        setLoading(true)
        const response = await api.listConnections()
        if (request !== revision.current) return
        setLoading(false)
        setError(response.code === '0000' ? null : response.info)
        if (response.data && response.code === '0000') setConnections(response.data)
    }, [])
    useEffect(() => { void refresh(); return () => { revision.current++ } }, [refresh])
    const save = async (payload: DbConnectionPayload) => {
        const response = await (payload.connectionId ? api.updateConnection(payload) : api.createConnection(payload))
        if (response.code !== '0000' || !response.data) return response.info || '保存失败'
        await refresh()
        return null
    }
    const remove = async (id: string) => {
        const response = await api.deleteConnection(id)
        if (response.code !== '0000') { setError(response.info); return false }
        await refresh()
        return true
    }
    return { connections, loading, error, refresh, save, remove }
}
