import { create } from "zustand";
import { load, save } from "../lib/storage";

const USER_ID_KEY = "settings.user-id.v1";
const DEFAULT_USER_ID = "default";

interface SettingsState {
  userId: string;
  setUserId: (userId: string) => void;
}

const initialUserId = load<string>(USER_ID_KEY, DEFAULT_USER_ID).trim() || DEFAULT_USER_ID;

export const useSettingsStore = create<SettingsState>((set) => ({
  userId: initialUserId,
  setUserId: (userId) => {
    const normalized = userId.trim() || DEFAULT_USER_ID;
    save(USER_ID_KEY, normalized);
    set({ userId: normalized });
  },
}));
