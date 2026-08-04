import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { useThemeStore } from "../../store/themeStore";
import "./window-titlebar.css";

interface Props {
  className: string;
  children: ReactNode;
}

const INTERACTIVE_SELECTOR =
  "button, a, input, textarea, select, [role='button'], [data-window-no-drag]";

function reportWindowError(action: string, reason: unknown) {
  console.error(`${action}失败`, reason);
}

export function WindowTitleBar({ className, children }: Props) {
  const themeMode = useThemeStore((state) => state.mode);
  const appWindow = useMemo(() => (isTauri() ? getCurrentWindow() : null), []);
  const [customTitleBar, setCustomTitleBar] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!appWindow) return;

    let disposed = false;
    let unlistenResize: (() => void) | undefined;

    const syncMaximized = async () => {
      const nextMaximized = await appWindow.isMaximized();
      if (!disposed) setMaximized(nextMaximized);
    };

    void appWindow.isDecorated()
      .then(async (decorated) => {
        if (decorated || disposed) return;
        setCustomTitleBar(true);
        await syncMaximized();
        const unlisten = await appWindow.onResized(() => {
          void syncMaximized().catch((reason) => reportWindowError("同步窗口状态", reason));
        });
        if (disposed) unlisten();
        else unlistenResize = unlisten;
      })
      .catch((reason) => reportWindowError("初始化自绘标题栏", reason));

    return () => {
      disposed = true;
      unlistenResize?.();
    };
  }, [appWindow]);

  useEffect(() => {
    if (!appWindow || !customTitleBar) return;
    const nativeTheme = themeMode === "light" ? "light" : "dark";
    void appWindow
      .setTheme(nativeTheme)
      .catch((reason) => reportWindowError("同步窗口主题", reason));
  }, [appWindow, customTitleBar, themeMode]);

  const toggleMaximize = useCallback(() => {
    if (!appWindow) return;
    void appWindow
      .toggleMaximize()
      .then(() => appWindow.isMaximized())
      .then(setMaximized)
      .catch((reason) => reportWindowError("切换窗口大小", reason));
  }, [appWindow]);

  const handleMouseDown = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!appWindow || !customTitleBar || event.button !== 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest(INTERACTIVE_SELECTOR)) return;

      if (event.detail === 2) {
        event.preventDefault();
        toggleMaximize();
        return;
      }

      void appWindow
        .startDragging()
        .catch((reason) => reportWindowError("拖动窗口", reason));
    },
    [appWindow, customTitleBar, toggleMaximize],
  );

  const runWindowCommand = useCallback(
    (action: "minimize" | "close") => {
      if (!appWindow) return;
      const command = action === "minimize" ? appWindow.minimize() : appWindow.close();
      void command.catch((reason) =>
        reportWindowError(action === "minimize" ? "最小化窗口" : "关闭窗口", reason),
      );
    },
    [appWindow],
  );

  return (
    <header
      className={`${className} window-titlebar${customTitleBar ? " window-titlebar-custom" : ""}`}
    >
      <div className="window-titlebar-content" onMouseDown={handleMouseDown}>
        {children}
      </div>

      {customTitleBar && (
        <div className="window-titlebar-controls" role="group" aria-label="窗口控制">
          <button
            className="window-titlebar-control"
            type="button"
            title="最小化"
            aria-label="最小化窗口"
            onClick={() => runWindowCommand("minimize")}
          >
            <Minus size={15} strokeWidth={1.5} />
          </button>
          <button
            className="window-titlebar-control"
            type="button"
            title={maximized ? "还原" : "最大化"}
            aria-label={maximized ? "还原窗口" : "最大化窗口"}
            onClick={toggleMaximize}
          >
            {maximized ? (
              <Copy className="window-titlebar-restore-icon" size={13} strokeWidth={1.4} />
            ) : (
              <Square size={12} strokeWidth={1.5} />
            )}
          </button>
          <button
            className="window-titlebar-control window-titlebar-close"
            type="button"
            title="关闭"
            aria-label="关闭窗口"
            onClick={() => runWindowCommand("close")}
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </header>
  );
}
