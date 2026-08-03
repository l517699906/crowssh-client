import { useEffect, type RefObject } from "react";
import { KeyRound, RotateCcw } from "lucide-react";
import { useLayoutStore } from "../../store/layoutStore";
import { useThemeStore } from "../../store/themeStore";
import type { ThemeMode } from "../../store/themeStore";

const THEME_OPTIONS: { mode: ThemeMode; label: string; color: string }[] = [
  { mode: "dark", label: "深色", color: "#3574f0" },
  { mode: "light", label: "浅色", color: "#ffffff" },
  { mode: "midnight", label: "午夜", color: "#58a6ff" },
  { mode: "forest", label: "森林", color: "#65b579" },
];

interface Props {
  onClose: () => void;
  onOpenAiSettings: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}

export function SettingsPopover({ onClose, onOpenAiSettings, anchorRef }: Props) {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const resetLayout = useLayoutStore((s) => s.reset);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  return (
    <div className="settings-popover" role="dialog" aria-label="设置">
      <div className="settings-title">外观</div>
      <div className="theme-grid">
        {THEME_OPTIONS.map((theme) => (
          <button
            key={theme.mode}
            className={mode === theme.mode ? "active" : ""}
            type="button"
            onClick={() => setMode(theme.mode)}
          >
            <span className="theme-swatch" style={{ backgroundColor: theme.color }} />
            {theme.label}
          </button>
        ))}
      </div>

      <div className="settings-section">
        <div className="settings-title">AI</div>
        <button className="btn settings-wide-action" type="button" onClick={onOpenAiSettings}>
          <KeyRound size={14} /> 管理密钥与模型
        </button>
      </div>

      <div className="settings-section settings-bottom-action">
        <button className="btn" type="button" onClick={resetLayout}>
          <RotateCcw size={14} /> 重置界面布局
        </button>
      </div>
    </div>
  );
}
