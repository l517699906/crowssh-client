import { create } from 'zustand'

export interface WorkbenchTab { id: string; kind: 'terminal' | 'sql' }
interface WorkbenchState {
    tabs: WorkbenchTab[]
    activeId: string | null
    open: (tab: WorkbenchTab) => void
    activate: (id: string) => void
    close: (id: string) => void
    reorder: (id: string, beforeId: string) => void
}

/** 只管理标签顺序和焦点，物理连接由各自会话层管理；重启不恢复执行身份。 */
export const useWorkbenchStore = create<WorkbenchState>((set) => ({
    tabs: [],
    activeId: null,
    open: (tab) => set((state) => {
        const existing = state.tabs.find((item) => item.id === tab.id)
        if (existing && existing.kind !== tab.kind) throw new Error('工作台标签类型不匹配')
        return { tabs: existing ? state.tabs : [...state.tabs, tab], activeId: tab.id }
    }),
    activate: (id) => set((state) => state.tabs.some((tab) => tab.id === id) ? { activeId: id } : state),
    close: (id) => set((state) => {
        const index = state.tabs.findIndex((tab) => tab.id === id)
        if (index < 0) return state
        const tabs = state.tabs.filter((tab) => tab.id !== id)
        return { tabs, activeId: state.activeId === id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : state.activeId }
    }),
    reorder: (id, beforeId) => set((state) => {
        if (id === beforeId) return state
        const tab = state.tabs.find((item) => item.id === id)
        if (!tab || !state.tabs.some((item) => item.id === beforeId)) return state
        const tabs = state.tabs.filter((item) => item.id !== id)
        tabs.splice(tabs.findIndex((item) => item.id === beforeId), 0, tab)
        return { tabs }
    }),
}))
