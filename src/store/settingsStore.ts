import { create } from "zustand";

interface SettingsState {
  principalId: string | null;
  setPrincipalId: (principalId: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  principalId: null,
  setPrincipalId: (principalId) => set({ principalId: principalId.trim() }),
}));
