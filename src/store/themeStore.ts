import { create } from "zustand";
import {
  applyTokens,
  islandsDark,
  islandsLight,
  midnight,
  forest,
  type ThemeTokens,
} from "../theme/themes";
import { load, save } from "../lib/storage";

export type ThemeMode = "dark" | "light" | "midnight" | "forest";
const KEY = "theme.mode";

function tokensFor(mode: ThemeMode): ThemeTokens {
  switch (mode) {
    case "light":
      return islandsLight;
    case "midnight":
      return midnight;
    case "forest":
      return forest;
    default:
      return islandsDark;
  }
}

interface ThemeState {
  mode: ThemeMode;
  tokens: ThemeTokens;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const initialMode = load<ThemeMode>(KEY, "dark");

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: initialMode,
  tokens: tokensFor(initialMode),
  setMode: (mode) => {
    const tokens = tokensFor(mode);
    applyTokens(tokens);
    save(KEY, mode);
    set({ mode, tokens });
  },
  toggleMode: () => get().setMode(get().mode === "dark" ? "light" : "dark"),
}));
