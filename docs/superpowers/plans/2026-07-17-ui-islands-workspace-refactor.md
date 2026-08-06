# CrowSSH Islands 工作台重构 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development 或 superpowers:executing-plans 逐任务实现。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 把固定三栏布局重构为 VS Code/IntelliJ Islands 风格可组合工作台，颜色由 `themeStore` 统一管理，支持明暗双主题且终端联动。

**Architecture:** 两个 Zustand store（`themeStore` 色板注入 CSS 变量、`layoutStore` 面板显隐/宽度）。布局树 `AppLayout` = Header + [ActivityBar + LeftSidebar + Splitter + Terminal + Splitter + RightSidebar]。终端订阅 themeStore 运行时刷新 xterm theme。

**Tech Stack:** React 19 + TS + Zustand + xterm.js + lucide-react + Tauri v2。

**测试说明：** 项目无单测框架。每任务用 `npx tsc --noEmit` 类型检查验证；关键节点用 `npm run build` 与 Playwright 视觉验证。**git 提交按项目约定需主人确认，计划中的 commit 步骤为建议收尾。**

**Spec:** `docs/superpowers/specs/2026-07-17-ui-islands-workspace-refactor-design.md`

---

## 文件结构总览

**新增**
- `src/theme/themes.ts` — `ThemeTokens` 类型 + `islandsDark`/`islandsLight` + `applyTokens()` + `buildXtermTheme()`
- `src/store/themeStore.ts` — Zustand 主题 store
- `src/store/layoutStore.ts` — Zustand 布局 store
- `src/components/layout/AppLayout.tsx` — 布局装配 + 服务器对话框
- `src/components/layout/Header.tsx` — 顶栏
- `src/components/layout/ActivityBar.tsx` — 图标导航 + 设置入口
- `src/components/layout/SettingsPopover.tsx` — 设置面板（主题切换）
- `src/components/layout/LeftSidebar.tsx` — 内容面板容器
- `src/components/layout/RightSidebar.tsx` — AI 面板容器
- `src/components/layout/workbench.css` — 布局样式
- `src/components/servers/ServerView.tsx` — 服务器视图（由 ServerPanel 改造，dialog 外提）
- `src/components/files/FilesView.tsx`、`src/components/sftp/SftpView.tsx` — 占位视图

**改动**
- `src/theme.css`（移除 :root 颜色硬编码值）、`src/main.tsx`（首屏注入）、`src/App.tsx`（渲染 AppLayout）、`src/components/terminal/TerminalView.tsx`（主题订阅）、`src/components/layout/Splitter.tsx`（受控）、`package.json`（+zustand）
- 删除 `src/components/servers/ServerPanel.tsx`（内容迁入 ServerView）

**复用不变：** `ssh.rs`、`useServers`/`useTerminals`/`useChat`、`ErrorBoundary`、`ServerList`/`ServerFormDialog`、chat/* 全部、`terminal.css`/`servers.css`/`chat.css`。

---

## Task 1: 安装 Zustand

**Files:** `package.json`

- [ ] **Step 1: 安装**

Run: `npm install zustand`
Expected: 安装成功，`package.json` dependencies 出现 `zustand`。

- [ ] **Step 2: 提交（建议，待确认）**

```bash
git add package.json package-lock.json && git commit -m "chore: add zustand"
```

---

## Task 2: 主题色板与工具函数 `themes.ts`

**Files:** Create `src/theme/themes.ts`

- [ ] **Step 1: 写入完整文件**

```ts
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

/** ThemeTokens.terminal -> xterm ITheme（结构一致，直接返回） */
export function buildXtermTheme(t: ThemeTokens["terminal"]) {
  return { ...t };
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 3: `themeStore`

**Files:** Create `src/store/themeStore.ts`

- [ ] **Step 1: 写入完整文件**

```ts
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
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误。

---

## Task 4: `layoutStore`

**Files:** Create `src/store/layoutStore.ts`

- [ ] **Step 1: 写入完整文件**

```ts
import { create } from "zustand";
import { load, save } from "../lib/storage";

export type ActivityView = "servers" | "files" | "sftp";
const KEY = "layout.state";

interface Persisted {
  activeView: ActivityView;
  leftVisible: boolean;
  terminalVisible: boolean;
  rightVisible: boolean;
  leftWidth: number;
  rightWidth: number;
}

const DEFAULTS: Persisted = {
  activeView: "servers",
  leftVisible: true,
  terminalVisible: true,
  rightVisible: true,
  leftWidth: 260,
  rightWidth: 360,
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

interface LayoutState extends Persisted {
  selectActivity: (v: ActivityView) => void;
  toggleLeft: () => void;
  toggleTerminal: () => void;
  toggleRight: () => void;
  setLeftWidth: (w: number) => void;
  setRightWidth: (w: number) => void;
}

const init = { ...DEFAULTS, ...load<Partial<Persisted>>(KEY, {}) };

function persist(s: LayoutState) {
  const { activeView, leftVisible, terminalVisible, rightVisible, leftWidth, rightWidth } = s;
  save<Persisted>(KEY, { activeView, leftVisible, terminalVisible, rightVisible, leftWidth, rightWidth });
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  ...init,
  selectActivity: (v) =>
    set((s) => {
      const next =
        s.activeView === v && s.leftVisible
          ? { leftVisible: false }
          : { activeView: v, leftVisible: true };
      const merged = { ...s, ...next };
      persist(merged);
      return next;
    }),
  toggleLeft: () => set((s) => { const n = { leftVisible: !s.leftVisible }; persist({ ...s, ...n }); return n; }),
  toggleTerminal: () => set((s) => { const n = { terminalVisible: !s.terminalVisible }; persist({ ...s, ...n }); return n; }),
  toggleRight: () => set((s) => { const n = { rightVisible: !s.rightVisible }; persist({ ...s, ...n }); return n; }),
  setLeftWidth: (w) => set((s) => { const n = { leftWidth: clamp(w, 180, 480) }; persist({ ...s, ...n }); return n; }),
  setRightWidth: (w) => set((s) => { const n = { rightWidth: clamp(w, 300, 600) }; persist({ ...s, ...n }); return n; }),
}));
```

- [ ] **Step 2: 类型检查** — Run: `npx tsc --noEmit` — Expected: 无错误。

---

## Task 5: `theme.css` 去硬编码 + `main.tsx` 首屏注入

**Files:** Modify `src/theme.css`、`src/main.tsx`

- [ ] **Step 1: 替换 `theme.css` 的 `:root` 块**

将现有 `:root { ... }`（含全部颜色变量与几何/字体）替换为**仅保留几何与字体**（颜色改由 JS 注入）：

```css
:root {
  /* 几何 */
  --r-island: 10px;
  --r-ctl: 6px;
  --r-sm: 4px;
  --gap: 6px;
  /* 字体 */
  --font-ui: -apple-system, "Segoe UI", system-ui, "PingFang SC",
    "Microsoft YaHei", sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, Consolas, "Courier New",
    monospace;

  color-scheme: dark;
}
```

> 其余规则（reset、滚动条、`.island`、`.panel-header`、`.btn`、`.input` 等）**保持不变**——它们已用 `var(--xxx)`，颜色值将由 themeStore 注入。滚动条 thumb 的硬编码 `#4b4d52`/`#5c5f66` 改为 `var(--border)`/`var(--fg-disabled)` 以随主题变化。

- [ ] **Step 2: 修改滚动条颜色（同文件）**

将 `::-webkit-scrollbar-thumb` 的 `background-color: #4b4d52;` 改为 `background-color: var(--border);`；`:hover` 的 `#5c5f66` 改为 `var(--fg-disabled);`。

- [ ] **Step 3: `main.tsx` 首屏同步注入防 FOUC**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { useThemeStore } from "./store/themeStore";
import { applyTokens } from "./theme/themes";
import "./theme.css";

// 首屏同步注入初始主题，避免 FOUC
applyTokens(useThemeStore.getState().tokens);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 4: 类型检查** — Run: `npx tsc --noEmit` — Expected: 无错误。

---

## Task 6: `Splitter` 受控化

**Files:** Modify `src/components/layout/Splitter.tsx`

- [ ] **Step 1: 确认现有实现已足够**

现有 `Splitter` 已通过 `onResize(dx)` 报告增量，无需改内部逻辑。**本任务无代码改动**——调用方（AppLayout）传 `onResize={(dx) => setLeftWidth(leftWidth + dx)}` 即可。跳过。

---

## Task 7: 占位视图 FilesView / SftpView

**Files:** Create `src/components/files/FilesView.tsx`、`src/components/sftp/SftpView.tsx`

- [ ] **Step 1: `FilesView.tsx`**

```tsx
import { Folder } from "lucide-react";

export function FilesView() {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Folder size={14} /> 文件目录
        </span>
      </div>
      <div className="empty-state">
        <Folder size={28} strokeWidth={1.5} />
        <div className="empty-title">文件浏览开发中</div>
        <div className="empty-hint">连接服务器后浏览远程文件目录</div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: `SftpView.tsx`**

```tsx
import { FolderSync } from "lucide-react";

export function SftpView() {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <FolderSync size={14} /> SFTP 传输
        </span>
      </div>
      <div className="empty-state">
        <FolderSync size={28} strokeWidth={1.5} />
        <div className="empty-title">SFTP 传输开发中</div>
        <div className="empty-hint">后续迭代支持文件上传 / 下载</div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: 类型检查** — Run: `npx tsc --noEmit` — Expected: 无错误。

---

## Task 8: `ServerView`（由 ServerPanel 改造，dialog 外提）

**Files:** Create `src/components/servers/ServerView.tsx`；Delete `src/components/servers/ServerPanel.tsx`

- [ ] **Step 1: 写 `ServerView.tsx`（纯展示，dialog 由父层管理）**

```tsx
import { Plus, Server } from "lucide-react";
import type { ServerConfig } from "../../types";
import { ServerList } from "./ServerList";
import "./servers.css";

interface Props {
  servers: ServerConfig[];
  onConnect: (server: ServerConfig) => void;
  onAdd: () => void;
  onEdit: (server: ServerConfig) => void;
  onRemove: (id: string) => void;
}

export function ServerView({ servers, onConnect, onAdd, onEdit, onRemove }: Props) {
  return (
    <>
      <div className="panel-header">
        <span className="panel-title">
          <Server size={14} /> 服务器
        </span>
        <button className="icon-btn" title="新建服务器" onClick={onAdd}>
          <Plus size={18} />
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="empty-state">
          <Server size={28} strokeWidth={1.5} />
          <div className="empty-title">还没有服务器</div>
          <div className="empty-hint">点击右上角 + 添加一个 SSH 连接</div>
        </div>
      ) : (
        <ServerList
          servers={servers}
          onConnect={onConnect}
          onEdit={onEdit}
          onRemove={onRemove}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: 删除旧 `ServerPanel.tsx`**

Run: `rm src/components/servers/ServerPanel.tsx`
（其 dialog 逻辑上移至 AppLayout，见 Task 11。）

- [ ] **Step 3: 类型检查** — Run: `npx tsc --noEmit` — Expected: 报 `App.tsx` 仍引用 ServerPanel（下个任务修复），其余无错。

---

## Task 9: `SettingsPopover` + `ActivityBar`

**Files:** Create `src/components/layout/SettingsPopover.tsx`、`src/components/layout/ActivityBar.tsx`

- [ ] **Step 1: `SettingsPopover.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { useThemeStore } from "../../store/themeStore";

export function SettingsPopover({ onClose }: { onClose: () => void }) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  return (
    <div className="settings-popover" ref={ref}>
      <div className="settings-title">外观</div>
      <div className="segmented">
        <button
          className={mode === "dark" ? "active" : ""}
          onClick={() => setMode("dark")}
        >
          <Moon size={13} /> 深色
        </button>
        <button
          className={mode === "light" ? "active" : ""}
          onClick={() => setMode("light")}
        >
          <Sun size={13} /> 浅色
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `ActivityBar.tsx`**

```tsx
import { useState } from "react";
import { FolderSync, Folder, Server, Settings } from "lucide-react";
import { useLayoutStore, type ActivityView } from "../../store/layoutStore";
import { SettingsPopover } from "./SettingsPopover";

const ITEMS: { view: ActivityView; icon: typeof Server; label: string }[] = [
  { view: "servers", icon: Server, label: "服务器" },
  { view: "files", icon: Folder, label: "文件目录" },
  { view: "sftp", icon: FolderSync, label: "SFTP 传输" },
];

export function ActivityBar() {
  const activeView = useLayoutStore((s) => s.activeView);
  const leftVisible = useLayoutStore((s) => s.leftVisible);
  const selectActivity = useLayoutStore((s) => s.selectActivity);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="activity-bar">
      <div className="activity-top">
        {ITEMS.map(({ view, icon: Icon, label }) => {
          const active = activeView === view && leftVisible;
          return (
            <button
              key={view}
              className={`activity-item${active ? " active" : ""}`}
              title={label}
              onClick={() => selectActivity(view)}
            >
              <Icon size={22} strokeWidth={1.6} />
            </button>
          );
        })}
      </div>
      <div className="activity-bottom">
        <button
          className={`activity-item${settingsOpen ? " active" : ""}`}
          title="设置"
          onClick={() => setSettingsOpen((v) => !v)}
        >
          <Settings size={22} strokeWidth={1.6} />
        </button>
        {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 类型检查** — Run: `npx tsc --noEmit` — Expected: 除 App.tsx 既有报错外无新错误。

---

## Task 10: `Header`

**Files:** Create `src/components/layout/Header.tsx`

- [ ] **Step 1: 写入完整文件**

```tsx
import { PanelLeft, Plus, Sparkles, TerminalSquare } from "lucide-react";
import { useLayoutStore } from "../../store/layoutStore";
import type { useTerminals } from "../../hooks/useTerminals";

interface Props {
  terminals: ReturnType<typeof useTerminals>;
  onAddServer: () => void;
}

export function Header({ terminals, onAddServer }: Props) {
  const toggleLeft = useLayoutStore((s) => s.toggleLeft);
  const toggleTerminal = useLayoutStore((s) => s.toggleTerminal);
  const toggleRight = useLayoutStore((s) => s.toggleRight);
  const terminalVisible = useLayoutStore((s) => s.terminalVisible);
  const rightVisible = useLayoutStore((s) => s.rightVisible);

  const active = terminals.sessions.find((s) => s.id === terminals.activeId);

  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-btn" title="折叠侧边栏" onClick={toggleLeft}>
          <PanelLeft size={17} />
        </button>
        <button className="icon-btn" title="添加 SSH 连接" onClick={onAddServer}>
          <Plus size={18} />
        </button>
        <div className="header-divider" />
        <div className="header-conn">
          {active ? (
            <>
              <span className={`status-dot ${active.status}`} />
              <span className="header-conn-title">{active.title}</span>
            </>
          ) : (
            <span className="header-conn-empty">未连接</span>
          )}
        </div>
      </div>

      <div className="header-title">CrowSSH</div>

      <div className="header-right">
        <button
          className={`icon-btn${terminalVisible ? " active" : ""}`}
          title="终端面板"
          onClick={toggleTerminal}
        >
          <TerminalSquare size={17} />
        </button>
        <button
          className={`icon-btn${rightVisible ? " active" : ""}`}
          title="AI 助手"
          onClick={toggleRight}
        >
          <Sparkles size={17} />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 类型检查** — Run: `npx tsc --noEmit` — Expected: 除 App.tsx 既有报错外无新错误。

---

## Task 11: `LeftSidebar` + `RightSidebar` + `AppLayout` + `App.tsx`

**Files:** Create `LeftSidebar.tsx`、`RightSidebar.tsx`、`AppLayout.tsx`；Modify `src/App.tsx`

- [ ] **Step 1: `LeftSidebar.tsx`**

```tsx
import type { ServerConfig } from "../../types";
import { useLayoutStore } from "../../store/layoutStore";
import { ServerView } from "../servers/ServerView";
import { FilesView } from "../files/FilesView";
import { SftpView } from "../sftp/SftpView";

interface Props {
  servers: ServerConfig[];
  onConnect: (server: ServerConfig) => void;
  onAddServer: () => void;
  onEditServer: (server: ServerConfig) => void;
  onRemoveServer: (id: string) => void;
}

export function LeftSidebar({
  servers,
  onConnect,
  onAddServer,
  onEditServer,
  onRemoveServer,
}: Props) {
  const activeView = useLayoutStore((s) => s.activeView);
  return (
    <div className="left-sidebar island">
      {activeView === "servers" && (
        <ServerView
          servers={servers}
          onConnect={onConnect}
          onAdd={onAddServer}
          onEdit={onEditServer}
          onRemove={onRemoveServer}
        />
      )}
      {activeView === "files" && <FilesView />}
      {activeView === "sftp" && <SftpView />}
    </div>
  );
}
```

- [ ] **Step 2: `RightSidebar.tsx`**

```tsx
import { ChatPanel } from "../chat/ChatPanel";

export function RightSidebar() {
  return (
    <div className="right-sidebar island">
      <ChatPanel />
    </div>
  );
}
```

- [ ] **Step 3: `AppLayout.tsx`**

```tsx
import { useState } from "react";
import type { ServerConfig } from "../../types";
import type { useServers } from "../../hooks/useServers";
import type { useTerminals } from "../../hooks/useTerminals";
import { useLayoutStore } from "../../store/layoutStore";
import { Header } from "./Header";
import { ActivityBar } from "./ActivityBar";
import { LeftSidebar } from "./LeftSidebar";
import { RightSidebar } from "./RightSidebar";
import { Splitter } from "./Splitter";
import { TerminalPanel } from "../terminal/TerminalPanel";
import { ServerFormDialog } from "../servers/ServerFormDialog";
import "./workbench.css";

type Dialog = { mode: "add" } | { mode: "edit"; server: ServerConfig } | null;

interface Props {
  servers: ReturnType<typeof useServers>;
  terminals: ReturnType<typeof useTerminals>;
}

export function AppLayout({ servers, terminals }: Props) {
  const layout = useLayoutStore();
  const [dialog, setDialog] = useState<Dialog>(null);

  const handleSave = (cfg: ServerConfig | Omit<ServerConfig, "id">) => {
    if ("id" in cfg) servers.updateServer(cfg);
    else servers.addServer(cfg);
    setDialog(null);
  };

  return (
    <div className="app-layout">
      <Header terminals={terminals} onAddServer={() => setDialog({ mode: "add" })} />

      <div className="workbench">
        <ActivityBar />

        {layout.leftVisible && (
          <>
            <div style={{ width: layout.leftWidth, flexShrink: 0, display: "flex" }}>
              <LeftSidebar
                servers={servers.servers}
                onConnect={terminals.openSession}
                onAddServer={() => setDialog({ mode: "add" })}
                onEditServer={(s) => setDialog({ mode: "edit", server: s })}
                onRemoveServer={servers.removeServer}
              />
            </div>
            <Splitter onResize={(dx) => layout.setLeftWidth(layout.leftWidth + dx)} />
          </>
        )}

        {layout.terminalVisible && (
          <main className="terminal-region island">
            <TerminalPanel terminals={terminals} servers={servers.servers} />
          </main>
        )}

        {layout.rightVisible && (
          <>
            <Splitter onResize={(dx) => layout.setRightWidth(layout.rightWidth - dx)} />
            <div style={{ width: layout.rightWidth, flexShrink: 0, display: "flex" }}>
              <RightSidebar />
            </div>
          </>
        )}
      </div>

      {dialog && (
        <ServerFormDialog
          initial={dialog.mode === "edit" ? dialog.server : undefined}
          onSave={handleSave}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: 重写 `App.tsx`**

```tsx
import { useServers } from "./hooks/useServers";
import { useTerminals } from "./hooks/useTerminals";
import { AppLayout } from "./components/layout/AppLayout";

export default function App() {
  const servers = useServers();
  const terminals = useTerminals();
  return <AppLayout servers={servers} terminals={terminals} />;
}
```

- [ ] **Step 5: 类型检查** — Run: `npx tsc --noEmit` — Expected: 无错误（ServerPanel 引用已消除）。

---

## Task 12: 布局样式 `workbench.css`

**Files:** Create `src/components/layout/workbench.css`

- [ ] **Step 1: 写入完整文件**

```css
.app-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-canvas);
}

/* ---------- Header ---------- */
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  flex-shrink: 0;
  padding: 0 8px;
  gap: 8px;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.header-divider {
  width: 1px;
  height: 18px;
  background-color: var(--border);
  margin: 0 4px;
}
.header-conn {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--fg-muted);
  max-width: 260px;
}
.header-conn-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.header-conn-empty {
  font-size: 12px;
  color: var(--fg-disabled);
}
.header-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-muted);
  letter-spacing: 0.04em;
}
.icon-btn.active {
  background-color: var(--bg-selected-soft);
  color: var(--accent);
}

/* ---------- Workbench ---------- */
.workbench {
  flex: 1;
  min-height: 0;
  display: flex;
  padding: 0 var(--gap) var(--gap) 0;
}

/* ---------- ActivityBar ---------- */
.activity-bar {
  width: 48px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 8px;
}
.activity-top,
.activity-bottom {
  display: flex;
  flex-direction: column;
  gap: 4px;
  position: relative;
}
.activity-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: none;
  border-radius: var(--r-ctl);
  background: transparent;
  color: var(--fg-muted);
  position: relative;
  transition: background-color 0.12s, color 0.12s;
}
.activity-item:hover {
  background-color: var(--bg-hover);
  color: var(--fg);
}
.activity-item.active {
  color: var(--accent);
}
.activity-item.active::before {
  content: "";
  position: absolute;
  left: -4px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background-color: var(--accent);
}

/* ---------- Sidebars / regions ---------- */
.left-sidebar,
.right-sidebar {
  flex: 1;
  min-width: 0;
}
.terminal-region {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ---------- Settings popover ---------- */
.settings-popover {
  position: absolute;
  left: 48px;
  bottom: 0;
  width: 200px;
  padding: 12px;
  background-color: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--r-island);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 200;
}
.settings-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fg-muted);
  margin-bottom: 8px;
}
.settings-popover .segmented button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
```

- [ ] **Step 2: 调整 workbench 顶部内边距衔接 Header**

说明：Header 下方 workbench 用 `padding: 0 var(--gap) var(--gap) 0`（ActivityBar 自带左侧留白，故左 padding 为 0；顶部紧贴 Header）。若视觉上 Header 与岛屿需要间距，可将 workbench 改 `padding: var(--gap)` 并去掉 ActivityBar 外距——实现时以 Playwright 截图为准微调。

- [ ] **Step 3: 类型检查 + 构建** — Run: `npx tsc --noEmit && npm run build` — Expected: 均成功。

---

## Task 13: 终端主题联动 `TerminalView`

**Files:** Modify `src/components/terminal/TerminalView.tsx`

- [ ] **Step 1: 删除硬编码 `TERMINAL_THEME` 常量**

删除文件顶部的 `const TERMINAL_THEME = {...}`（约 20 行）。

- [ ] **Step 2: 引入 store 与 buildXtermTheme**

在 imports 增加：
```tsx
import { useThemeStore } from "../../store/themeStore";
import { buildXtermTheme } from "../../theme/themes";
```

- [ ] **Step 3: 初始 theme 用当前色板**

将 `new Terminal({... theme: TERMINAL_THEME })` 改为：
```tsx
const term = new Terminal({
  fontFamily: '"JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.2,
  cursorBlink: true,
  scrollback: 5000,
  theme: buildXtermTheme(useThemeStore.getState().tokens.terminal),
});
```

- [ ] **Step 4: 新增订阅 effect，主题切换即时刷新**

在组件内、现有 effect 之后添加：
```tsx
// 主题切换 -> 刷新 xterm 配色（无需重连）
const termTokens = useThemeStore((s) => s.tokens.terminal);
useEffect(() => {
  if (termRef.current) {
    termRef.current.options.theme = buildXtermTheme(termTokens);
  }
}, [termTokens]);
```

> 注意 `termRef` 已存在于组件。`termTokens` 订阅放在组件顶层（Hooks 规则），effect 依赖它。

- [ ] **Step 5: 类型检查 + 构建** — Run: `npx tsc --noEmit && npm run build` — Expected: 均成功。

- [ ] **Step 6: 提交（建议，待确认）**

```bash
git add -A && git commit -m "feat: Islands workspace layout + themeStore dark/light"
```

---

## Task 14: 端到端验证

**Files:** 无（验证）

- [ ] **Step 1: 构建校验** — Run: `npm run build` — Expected: tsc + vite 成功，零类型错误。

- [ ] **Step 2: 回归 Rust** — Run: `cd src-tauri && cargo check` — Expected: exit 0（后端未改）。

- [ ] **Step 3: Playwright 视觉验证（vite dev）**

启动 `npm run dev`，Playwright 访问 `http://localhost:1420/`（视口 1280×800），验证：
1. Header（折叠/＋/连接信息/终端/AI 按钮）、ActivityBar（3 图标 + 设置齿轮）、LeftSidebar、Terminal 区、RightSidebar 呈现 Islands 风格。
2. 点 Header 折叠 → LeftSidebar 隐藏；点终端/AI 按钮 → 对应面板显隐；按钮 active 态正确。
3. ActivityBar 点文件/SFTP → LeftSidebar 内容切换；点激活项 → 折叠。
4. 拖拽左右 Splitter → 宽度变化。
5. 点设置齿轮 → 弹出 popover；切换「浅色」→ **整体 CSS 变量即时变浅**（背景/文字/边框），popover 外点击关闭。
6. 刷新页面 → 主题与布局状态从 localStorage 恢复。

- [ ] **Step 4: 真实终端主题联动（Tauri，交主人验证）**

`npm run tauri dev`：连接真实服务器 → 终端渲染 → 设置里切换明暗 → **终端背景/前景/ANSI 颜色随之变化**（无需重连）。此步需真实凭据 + GUI，由主人在本机验证。

- [ ] **Step 5: 清理验证产物** — 删除 Playwright 截图与 `.playwright-mcp`、`dist`。

---

## Self-Review 结果

- **Spec 覆盖：** Header(§4→T10) / ActivityBar+设置(§4→T9) / LeftSidebar+视图(§4→T7,T8,T11) / RightSidebar(§4→T11) / themeStore(§3→T3) / layoutStore(§3→T4) / 双主题+注入(§2→T2,T5) / 终端联动(§6→T13) / 持久化(§9→T3,T4) / Splitter(§4→T6,T11)。无遗漏。
- **占位扫描：** 无 TBD/TODO；FilesView/SftpView 为设计规定的占位组件（有明确内容），非计划占位。
- **类型一致：** `ThemeTokens`、`applyTokens`、`buildXtermTheme`、`useThemeStore`/`useLayoutStore` 的方法名（`setMode`/`toggleMode`/`selectActivity`/`toggle*`/`set*Width`）在各任务间一致；`ServerFormDialog` 的 `onSave` 签名与 AppLayout `handleSave` 一致；`ServerView` props 与 LeftSidebar 传参一致。
