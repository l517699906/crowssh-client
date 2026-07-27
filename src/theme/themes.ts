// 主题色板：单一数据源。组件不硬编码颜色，一律经 CSS 变量或此对象。
export interface ThemeTokens {
  bgCanvas: string; bgIsland: string; bgTerminal: string; bgElevated: string;
  bgHover: string; bgActive: string; bgSelected: string; bgSelectedSoft: string;
  fg: string; fgMuted: string; fgDisabled: string;
  border: string; borderSubtle: string;
  accent: string; accentHover: string; onAccent: string;
  danger: string; dangerHover: string; success: string; warning: string;
  terminal: {
    background: string; foreground: string; cursor: string; selection: string;
    black: string; red: string; green: string; yellow: string; blue: string;
    magenta: string; cyan: string; white: string;
    brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
    brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
  };
}

export const islandsDark: ThemeTokens = {
  bgCanvas: "#2b2d30", bgIsland: "#1e1f22", bgTerminal: "#191a1c", bgElevated: "#26282c",
  bgHover: "#2e3338", bgActive: "#323438", bgSelected: "#2e436e", bgSelectedSoft: "#263141",
  fg: "#dfe1e5", fgMuted: "#9da0a8", fgDisabled: "#6f737a",
  border: "#393b40", borderSubtle: "#303235",
  accent: "#3574f0", accentHover: "#4a84f5", onAccent: "#ffffff",
  danger: "#db5c5c", dangerHover: "#e46b6b", success: "#5fad65", warning: "#d9a343",
  terminal: {
    background: "#191a1c", foreground: "#dfe1e5", cursor: "#dfe1e5", selection: "#2e436e",
    black: "#3f4451", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef",
    magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf",
    brightBlack: "#4b5263", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b",
    brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#dfe1e5",
  },
};

export const islandsLight: ThemeTokens = {
  // Islands Light：保持岛屿与画布的层级，同时降低大面积灰色的压迫感。
  bgCanvas: "#e7e9ed", bgIsland: "#ffffff", bgTerminal: "#fdfdfe", bgElevated: "#f7f8fa",
  bgHover: "#eef0f3", bgActive: "#e4e7eb", bgSelected: "#d9e6fb", bgSelectedSoft: "#edf3fc",
  fg: "#1e1f22", fgMuted: "#6c707e", fgDisabled: "#b4b9c4",
  border: "#d8dbe2", borderSubtle: "#e9ebef",
  accent: "#3574f0", accentHover: "#2f68d8", onAccent: "#ffffff",
  danger: "#d64c4c", dangerHover: "#c23e3e", success: "#4a9b52", warning: "#c48a1e",
  terminal: {
    background: "#fafafa", foreground: "#383a42", cursor: "#383a42", selection: "#c2d6f7",
    black: "#383a42", red: "#e45649", green: "#50a14f", yellow: "#c18401", blue: "#4078f2",
    magenta: "#a626a4", cyan: "#0184bc", white: "#a0a1a7",
    brightBlack: "#4f525e", brightRed: "#e45649", brightGreen: "#50a14f", brightYellow: "#c18401",
    brightBlue: "#4078f2", brightMagenta: "#a626a4", brightCyan: "#0184bc", brightWhite: "#383a42",
  },
};

export const midnight: ThemeTokens = {
  bgCanvas: "#161b22", bgIsland: "#0d1117", bgTerminal: "#090c10", bgElevated: "#21262d",
  bgHover: "#292e36", bgActive: "#30363d", bgSelected: "#1f4b77", bgSelectedSoft: "#172a3d",
  fg: "#e6edf3", fgMuted: "#8b949e", fgDisabled: "#484f58",
  border: "#30363d", borderSubtle: "#21262d",
  accent: "#2f81f7", accentHover: "#58a6ff", onAccent: "#ffffff",
  danger: "#f85149", dangerHover: "#ff6a63", success: "#3fb950", warning: "#d29922",
  terminal: {
    background: "#090c10", foreground: "#e6edf3", cursor: "#e6edf3", selection: "#1f4b77",
    black: "#484f58", red: "#ff7b72", green: "#7ee787", yellow: "#d2a8ff", blue: "#79c0ff",
    magenta: "#d2a8ff", cyan: "#a5d6ff", white: "#b1bac4",
    brightBlack: "#6e7681", brightRed: "#ffa198", brightGreen: "#aff5b4", brightYellow: "#e3b341",
    brightBlue: "#a5d6ff", brightMagenta: "#d2a8ff", brightCyan: "#b6e3ff", brightWhite: "#f0f6fc",
  },
};

export const forest: ThemeTokens = {
  bgCanvas: "#252a24", bgIsland: "#172018", bgTerminal: "#111812", bgElevated: "#223026",
  bgHover: "#2b3a2d", bgActive: "#334337", bgSelected: "#315c3d", bgSelectedSoft: "#23382a",
  fg: "#dce8dd", fgMuted: "#98ad9b", fgDisabled: "#617064",
  border: "#3b4a3e", borderSubtle: "#2b382e",
  accent: "#4c9a61", accentHover: "#65b579", onAccent: "#ffffff",
  danger: "#dc6962", dangerHover: "#e97a73", success: "#6fba78", warning: "#d2a64d",
  terminal: {
    background: "#111812", foreground: "#dce8dd", cursor: "#dce8dd", selection: "#315c3d",
    black: "#465248", red: "#dc6962", green: "#79bd80", yellow: "#d2a64d", blue: "#6aa7c8",
    magenta: "#ad82c4", cyan: "#62b2a5", white: "#c4d0c5",
    brightBlack: "#68766a", brightRed: "#e9827c", brightGreen: "#93cf99", brightYellow: "#e0ba68",
    brightBlue: "#84bbd6", brightMagenta: "#c09bd3", brightCyan: "#7fc8bc", brightWhite: "#edf5ee",
  },
};

/** 把色板写入 :root CSS 变量（组件用 var(--xxx)），零重渲染 */
export function applyTokens(t: ThemeTokens): void {
  const s = document.documentElement.style;
  s.setProperty("--bg-canvas", t.bgCanvas);
  s.setProperty("--bg-island", t.bgIsland);
  s.setProperty("--bg-terminal", t.bgTerminal);
  s.setProperty("--bg-elevated", t.bgElevated);
  s.setProperty("--bg-hover", t.bgHover);
  s.setProperty("--bg-active", t.bgActive);
  s.setProperty("--bg-selected", t.bgSelected);
  s.setProperty("--bg-selected-soft", t.bgSelectedSoft);
  s.setProperty("--fg", t.fg);
  s.setProperty("--fg-muted", t.fgMuted);
  s.setProperty("--fg-disabled", t.fgDisabled);
  s.setProperty("--border", t.border);
  s.setProperty("--border-subtle", t.borderSubtle);
  s.setProperty("--accent", t.accent);
  s.setProperty("--accent-hover", t.accentHover);
  s.setProperty("--on-accent", t.onAccent);
  s.setProperty("--danger", t.danger);
  s.setProperty("--danger-hover", t.dangerHover);
  s.setProperty("--success", t.success);
  s.setProperty("--warning", t.warning);
  document.documentElement.dataset.theme =
    t === islandsDark
      ? "dark"
      : t === islandsLight
        ? "light"
        : t === midnight
          ? "midnight"
          : "forest";
}

/** ThemeTokens.terminal -> xterm ITheme（selection -> selectionBackground） */
export function buildXtermTheme(t: ThemeTokens["terminal"]) {
  const { selection, ...rest } = t;
  return { ...rest, selectionBackground: selection, cursorAccent: t.background };
}
