import { create } from "zustand";

export type FloatingPanel = "monitor" | "transfers" | null;

interface FloatingPanelState {
  activePanel: FloatingPanel;
  setActivePanel: (panel: FloatingPanel) => void;
  togglePanel: (panel: Exclude<FloatingPanel, null>) => void;
}

export const useFloatingPanelStore = create<FloatingPanelState>((set) => ({
  activePanel: null,
  setActivePanel: (activePanel) => set({ activePanel }),
  togglePanel: (panel) =>
    set((state) => ({
      activePanel: state.activePanel === panel ? null : panel,
    })),
}));
