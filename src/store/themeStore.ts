import { create } from "zustand";
import {
  applyTokens,
  islandsDark,
  islandsLight,
  type ThemeTokens,
} from "../theme/themes";
import { load, save } from "../lib/storage";

type Mode = "dark" | "light";
const KEY = "theme.mode";

function tokensFor(mode: Mode): ThemeTokens {
  return mode === "dark" ? islandsDark : islandsLight;
}

interface ThemeState {
  mode: Mode;
  tokens: ThemeTokens;
  setMode: (mode: Mode) => void;
  toggleMode: () => void;
}

const initialMode = load<Mode>(KEY, "dark");

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
