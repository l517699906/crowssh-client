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
  // Islands Light 浮岛逻辑：缝隙(canvas)比岛屿更深，岛屿/编辑器更亮
  bgCanvas: "#d4d6db", bgIsland: "#ffffff", bgTerminal: "#fafafa", bgElevated: "#f2f3f5",
  bgHover: "#e8eaed", bgActive: "#dcdee3", bgSelected: "#c2d6f7", bgSelectedSoft: "#e3ecfb",
  fg: "#1e1f22", fgMuted: "#6c707e", fgDisabled: "#a8adbd",
  border: "#c4c7d0", borderSubtle: "#dfe1e5",
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
    t === islandsDark ? "dark" : t === islandsLight ? "light" : "custom";
}

/** ThemeTokens.terminal -> xterm ITheme（selection -> selectionBackground） */
export function buildXtermTheme(t: ThemeTokens["terminal"]) {
  const { selection, ...rest } = t;
  return { ...rest, selectionBackground: selection, cursorAccent: t.background };
}
