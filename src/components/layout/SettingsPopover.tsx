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
