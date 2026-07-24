import { create } from 'zustand'
import type { SSHConnection, ServerStatus } from '../types/index'
import * as sshApi from '../api/sshConnection'
import type { SshConnectionDTO, SshConnectionPayload } from '../api/sshConnection'

interface ConnectionStore {
    // 连接列表
    connections: SSHConnection[]
    // 当前选中的连接
    currentConnectionId: string | null
    // 服务端状态
    serverStatus: ServerStatus
    // 列表加载中
    loading: boolean
    // 操作错误信息
    error: string | null

    // 获取连接列表
    fetchConnections: (userId?: string) => Promise<void>
    // 创建连接
    createConnection: (payload: SshConnectionPayload) => Promise<boolean>
    // 更新连接
    updateConnection: (payload: SshConnectionPayload) => Promise<boolean>
    // 删除连接
    removeConnection: (id: string) => Promise<void>
    // 选中连接
    selectConnection: (id: string | null) => void
    // 获取单个连接详情
    getConnectionDetail: (id: string) => SSHConnection | undefined
    // 更新服务端状态
    setServerStatus: (status: Partial<ServerStatus>) => void
    // 清除错误
    clearError: () => void
    // 建立 SSH 连接
    connect: (id: string) => Promise<boolean>
    // 断开 SSH 连接
    disconnect: (id: string) => Promise<boolean>
}

/** 后端 DTO → 前端模型 */
function dtoToConnection(dto: SshConnectionDTO): SSHConnection {
    return {
        id: dto.connectionId,
        name: dto.connectionName,
        host: dto.host,
        port: dto.port,
        username: dto.username,
        authType: dto.authType,
        status: dto.status,
        createdAt: new Date(dto.createdAt).getTime(),
        updatedAt: dto.updatedAt ? new Date(dto.updatedAt).getTime() : Date.now(),
    }
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
    connections: [],
    currentConnectionId: null,
    serverStatus: {
        connected: false,
        url: 'http://localhost:8091',
    },
    loading: false,
    error: null,

    fetchConnections: async (userId = 'default') => {
        set({ loading: true, error: null })
        try {
            const res = await sshApi.getConnectionList(userId)
            if (res.code === '0000' && res.data) {
                const connections = res.data.map(dtoToConnection)
                set({ connections, serverStatus: { ...get().serverStatus, connected: true } })
            } else {
                set({ error: res.info || '获取连接列表失败' })
            }
        } catch {
            set({ error: '网络错误，无法连接服务器' })
        } finally {
            set({ loading: false })
        }
    },

    createConnection: async (payload) => {
        set({ error: null })
        try {
            const res = await sshApi.createConnection(payload)
            if (res.code === '0000' && res.data) {
                // 创建成功后刷新列表
                await get().fetchConnections()
                // 自动选中新创建的连接
                const newConn = dtoToConnection(res.data)
                set({ currentConnectionId: newConn.id })
                return true
            }
            set({ error: res.info || '创建连接失败' })
            return false
        } catch {
            set({ error: '网络错误，无法连接服务器' })
            return false
        }
    },

    updateConnection: async (payload) => {
        set({ error: null })
        try {
            const res = await sshApi.updateConnection(payload)
            if (res.code === '0000' && res.data) {
                // 更新成功后刷新列表
                await get().fetchConnections()
                return true
            }
            set({ error: res.info || '更新连接失败' })
            return false
        } catch {
            set({ error: '网络错误，无法连接服务器' })
            return false
        }
    },

    removeConnection: async (id) => {
        set({ error: null })
        try {
            const res = await sshApi.deleteConnection(id)
            if (res.code === '0000') {
                set((state) => ({
                    connections: state.connections.filter((c) => c.id !== id),
                    currentConnectionId: state.currentConnectionId === id ? null : state.currentConnectionId,
                }))
            } else {
                set({ error: res.info || '删除连接失败' })
            }
        } catch {
            set({ error: '网络错误，无法连接服务器' })
        }
    },

    selectConnection: (id) => set({ currentConnectionId: id }),

    getConnectionDetail: (id) => {
        return get().connections.find((c) => c.id === id)
    },

    setServerStatus: (status) =>
        set((state) => ({
            serverStatus: { ...state.serverStatus, ...status },
        })),

    clearError: () => set({ error: null }),

    connect: async (id) => {
        set({ error: null })
        try {
            const res = await sshApi.connect(id)
            if (res.code === '0000') {
                // 更新本地状态为已连接
                set((state) => ({
                    connections: state.connections.map((c) =>
                        c.id === id ? { ...c, status: 1 } : c
                    ),
                }))
                return true
            }
            set({ error: res.info || '连接失败' })
            return false
        } catch {
            set({ error: '网络错误，无法连接服务器' })
            return false
        }
    },

    disconnect: async (id) => {
        set({ error: null })
        try {
            const res = await sshApi.disconnect(id)
            if (res.code === '0000') {
                // 更新本地状态为未连接
                set((state) => ({
                    connections: state.connections.map((c) =>
                        c.id === id ? { ...c, status: 0 } : c
                    ),
                }))
                return true
            }
            set({ error: res.info || '断开连接失败' })
            return false
        } catch {
            set({ error: '网络错误，无法连接服务器' })
            return false
        }
    },
}))
