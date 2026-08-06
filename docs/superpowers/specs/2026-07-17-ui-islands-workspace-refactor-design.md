# CrowSSH UI 重构：IntelliJ Islands 工作台设计

> 日期：2026-07-17 · 状态：待评审

## 1. 背景与目标

当前 CrowSSH 是**固定三栏布局**（ServerPanel / TerminalPanel / ChatPanel），主题为 `theme.css` 里**静态硬编码**的 CSS 变量，无状态管理库，面板不可折叠。

本次重构将其升级为 **VS Code / IntelliJ Islands 风格的可组合工作台**：

- 顶部 Header（面板显隐控制 + 连接信息 + 添加连接）
- 左侧 ActivityBar（图标导航）+ LeftSidebar（内容面板：服务器 / 文件 / SFTP）
- 中间 Terminal 主体工作区
- 右侧 RightSidebar AI 对话（可拖拽宽度）
- 所有面板可独立显隐、面板间可拖拽调宽
- **颜色系统由 `themeStore` 统一管理**（不硬编码），支持 **Islands Dark / Light 双主题切换**，**终端颜色随主题联动**

### 已确认的关键决策
| 决策 | 选择 |
|---|---|
| 全局状态管理 | **Zustand**（轻量 store，局部订阅无重渲染） |
| 主题范围 | **Islands Dark + Islands Light 两套**，可切换 |
| 文件目录 / SFTP | **本次仅 UI 骨架/占位**，真实 SFTP 后续迭代 |
| 主题驱动样式机制 | **色板对象存 store → 注入 `:root` CSS 变量 → 终端订阅刷新** |
| 主题切换入口 | **ActivityBar 底部设置按钮**（齿轮）→ 设置面板，目前仅"切换主题" |

### 非目标（YAGNI）
- 真实 SFTP/文件传输后端（russh sftp、上传下载）
- 第三套及以上主题
- 布局尺寸持久化到磁盘（本次内存态即可；可选 localStorage，见 §9）

---

## 2. 架构：主题系统机制（核心）

**单一数据源 → CSS 变量注入 → 终端订阅**，三段式：

1. **色板定义** `src/theme/themes.ts`：定义 `ThemeTokens` 类型与两个常量 `islandsDark`、`islandsLight`。每个 token 是语义色（非硬编码到组件）。
2. **注入** `themeStore` 订阅：主题变化时，把 `tokens` 展开写入 `document.documentElement.style.setProperty('--xxx', value)`。组件 CSS 继续用 `var(--xxx)`（零重渲染、高效）。
3. **终端联动** `TerminalView` 订阅 `themeStore.tokens.terminal`：主题变化时执行 `term.options.theme = buildXtermTheme(tokens)`（xterm 6 支持运行时改 theme）。

```ts
// src/theme/themes.ts
export interface ThemeTokens {
  // 背景层次
  bgCanvas: string; bgIsland: string; bgTerminal: string; bgElevated: string;
  bgHover: string; bgActive: string; bgSelected: string; bgSelectedSoft: string;
  // 文字 / 边框
  fg: string; fgMuted: string; fgDisabled: string;
  border: string; borderSubtle: string;
  // 强调 / 语义
  accent: string; accentHover: string; onAccent: string;
  danger: string; dangerHover: string; success: string; warning: string;
  // 终端专属（含 16 ANSI）
  terminal: {
    background: string; foreground: string; cursor: string; selection: string;
    black: string; red: string; green: string; yellow: string; blue: string;
    magenta: string; cyan: string; white: string;
    brightBlack: string; brightRed: string; brightGreen: string; brightYellow: string;
    brightBlue: string; brightMagenta: string; brightCyan: string; brightWhite: string;
  };
}
```

- **`islandsDark`**：沿用当前 `theme.css` 深色值（canvas `#2b2d30` / island `#1e1f22` / terminal `#191a1c` / accent `#3574f0`…）+ 现 One Dark ANSI 终端色板。
- **`islandsLight`**：新配 Islands 浅色（浮岛逻辑反转：主窗口背景比工具窗**更深**，工具窗/编辑器更亮；典型 canvas `#e0e2e6` / island `#ffffff` / terminal `#fafafa` / accent `#3574f0` / fg `#1e1f22`…）+ 浅色 ANSI 终端色板。

**CSS 变量命名映射**：`bgCanvas → --bg-canvas`、`accentHover → --accent-hover`（camelCase → kebab）。一个 `applyTokens(tokens)` 工具函数负责映射+注入。`theme.css` **保留全部变量名与非颜色规则**（圆角/间距/字体/布局），仅**移除 `:root` 里颜色的硬编码值**（由 JS 注入；为避免 FOUC，`main.tsx` 首屏同步注入一次）。

---

## 3. 状态层（Zustand）

### `src/store/themeStore.ts`
```ts
interface ThemeState {
  mode: 'dark' | 'light';
  tokens: ThemeTokens;         // 派生自 mode
  toggleMode(): void;
  setMode(m: 'dark' | 'light'): void;
}
```
- `toggleMode`/`setMode` 更新 `mode` 与 `tokens`，并调用 `applyTokens(tokens)` 注入 CSS 变量。
- 初始 `mode: 'dark'`。

### `src/store/layoutStore.ts`
```ts
type ActivityView = 'servers' | 'files' | 'sftp';
interface LayoutState {
  activeView: ActivityView;    // LeftSidebar 当前内容
  leftVisible: boolean;        // LeftSidebar 显隐
  terminalVisible: boolean;    // 中间终端面板显隐
  rightVisible: boolean;       // RightSidebar(AI) 显隐
  leftWidth: number;           // px，拖拽调整
  rightWidth: number;          // px，拖拽调整
  selectActivity(v: ActivityView): void; // 点激活项则折叠，否则切换并展开
  toggleLeft(): void; toggleTerminal(): void; toggleRight(): void;
  setLeftWidth(w: number): void; setRightWidth(w: number): void;
}
```
- `selectActivity(v)`：VS Code 行为 —— 若 `v === activeView && leftVisible` 则 `leftVisible=false`；否则 `activeView=v, leftVisible=true`。
- 宽度 setter 内做 clamp（left 180–480，right 300–600）。

> 服务器/终端/对话业务状态**继续用现有 hooks**（`useServers`/`useTerminals`/`useChat`），本次不迁入 Zustand（YAGNI）。仅**全局 UI 状态**（主题、布局）进 store。

---

## 4. 布局组件树

```
<AppLayout>                        // 顶层：列方向
  <Header/>                        // 固定高度顶栏
  <div class="workbench">          // flex row，flex:1
    <ActivityBar/>                 // 固定窄条，始终显示
    {leftVisible && <LeftSidebar/>}// width=leftWidth
    {leftVisible && <Splitter side="left"/>}
    {terminalVisible && <TerminalPanel/>}  // flex:1 主体
    {rightVisible && <Splitter side="right"/>}
    {rightVisible && <RightSidebar/>}      // width=rightWidth
  </div>
</AppLayout>
```
文件：`src/components/layout/AppLayout.tsx`、`Header.tsx`、`ActivityBar.tsx`、`LeftSidebar.tsx`、`RightSidebar.tsx`（+ 现有 `Splitter.tsx` 改造）。

### Header（`Header.tsx`）
自左至右：
- **折叠按钮**（PanelLeft 图标）→ `toggleLeft()`
- **添加 SSH 连接**（Plus）→ 打开服务器新建对话框（复用 `ServerFormDialog`；通过 `useServers.addServer`）
- **当前连接信息**：显示活动终端 tab 的 `title`（别名或 `user@host`）+ 状态点；无连接时显示占位
- 右侧：**终端 toggle**（TerminalSquare）→ `toggleTerminal()`；**AI助手 toggle**（Sparkles/MessageSquare）→ `toggleRight()`
- 各 toggle 按钮用 `active` 态高亮反映对应面板是否可见。

### ActivityBar（`ActivityBar.tsx`）
- 顶部三图标：**服务器**（Server）/ **文件**（Folder）/ **SFTP**（ArrowLeftRight 或 FolderSync）→ `selectActivity(view)`，激活项高亮（左侧 accent 竖条）。
- 底部：**设置按钮**（Settings 齿轮）→ 打开设置面板（popover/小面板），当前仅含**主题切换**（明/暗，Sun/Moon 分段或开关，调用 `themeStore.toggleMode`）。

### LeftSidebar（`LeftSidebar.tsx`）
按 `activeView` 渲染：
- `servers` → **ServerView**（迁移现有 `ServerPanel` 内容）
- `files` → **FilesView**（占位：空态"文件浏览开发中"）
- `sftp` → **SftpView**（占位：空态"SFTP 传输开发中"）
面板顶部带标题栏（复用 `.panel-header`）。

### TerminalPanel / RightSidebar
- `TerminalPanel`：沿用现有实现（tabs + xterm + ErrorBoundary），终端主题改为订阅 `themeStore`（见 §2）。
- `RightSidebar`：包裹现有 `ChatPanel`，宽度受 `rightWidth` 控制。

### Splitter 改造
现有 `Splitter` 报告 `onResize(dx)`。改造：`<Splitter onResize={dx => setLeftWidth(leftWidth + dx)}/>`（right 侧用 `setRightWidth(rightWidth - dx)`）。逻辑基本不变，接 store setter。

---

## 5. 文件组织

**新增**
```
src/theme/themes.ts            ThemeTokens 类型 + islandsDark/islandsLight + applyTokens()
src/store/themeStore.ts        Zustand 主题 store
src/store/layoutStore.ts       Zustand 布局 store
src/components/layout/AppLayout.tsx
src/components/layout/Header.tsx
src/components/layout/ActivityBar.tsx
src/components/layout/LeftSidebar.tsx
src/components/layout/RightSidebar.tsx
src/components/layout/SettingsPopover.tsx     设置面板（主题切换）
src/components/files/FilesView.tsx            占位
src/components/sftp/SftpView.tsx              占位
src/components/layout/workbench.css           新布局样式（Header/ActivityBar/Sidebar）
```
**改动**
```
src/theme.css                  移除 :root 颜色硬编码值（保留变量名与非颜色规则）
src/main.tsx                   首屏同步 applyTokens(初始主题) 防 FOUC
src/App.tsx                    改为渲染 <AppLayout/>
src/components/servers/ServerPanel.tsx   抽为 ServerView（供 LeftSidebar 使用）
src/components/terminal/TerminalView.tsx 终端主题订阅 themeStore
src/components/layout/Splitter.tsx        接 store setter（受控宽度）
package.json                   + zustand
```
**复用不变**：`ssh.rs`、`useServers`/`useTerminals`/`useChat`、`ErrorBoundary`、chat/* 组件、servers 的 List/FormDialog。

---

## 6. 终端主题联动细节

`TerminalView`：
- 用 `useThemeStore(s => s.tokens.terminal)` 订阅终端色板。
- 初次 `new Terminal({ theme: buildXtermTheme(tokens.terminal) })`。
- `useEffect([tokens.terminal])`：`termRef.current.options.theme = buildXtermTheme(...)`，实现切换主题即时刷新（无需重连/重建终端）。
- `buildXtermTheme(t)` 把 `ThemeTokens.terminal` 映射为 xterm 的 `ITheme`。

---

## 7. 依赖
- 新增：`zustand`（前端）。无新增 Rust 依赖（SFTP 为占位）。

---

## 8. 验证方法
1. `npm run build`（tsc + vite）零类型错误。
2. Playwright（vite dev）视觉验证：Header / ActivityBar / 三面板布局呈现 Islands 风格。
3. **面板显隐**：Header 折叠/终端/AI 按钮切换对应面板显隐；ActivityBar 图标切换 LeftSidebar 内容、点激活项折叠。
4. **拖拽**：左右 Splitter 拖拽调宽生效并 clamp。
5. **主题联动**（核心）：设置面板切换明/暗 → 全局 CSS 变量即时变化 → 终端背景/前景/ANSI 颜色同步变化（在 Tauri dev 下真实终端验证；浏览器下验证 UI 部分）。
6. `cargo check` 仍通过（后端未改，回归确认）。

## 9. 补充决策（已明确）
- **持久化**：`themeStore.mode` 与 `layoutStore` 的 `leftWidth/rightWidth/leftVisible/terminalVisible/rightVisible/activeView` 持久化到 `localStorage`（复用现有 `src/lib/storage.ts` 的 `load/save`）。store 初始值从 localStorage 读取，变更时写回。
- **设置面板形态**：轻量 **popover**（`SettingsPopover.tsx`，绝对定位于 ActivityBar 设置按钮旁，点击外部关闭），非模态对话框。
