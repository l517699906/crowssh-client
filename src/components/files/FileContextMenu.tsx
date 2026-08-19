import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Download,
  FilePenLine,
  FilePlus2,
  FolderPlus,
  PackageOpen,
  Pencil,
  ShieldCheck,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { RemoteFile } from "../../api/sftp";
import { remoteTextOpenError } from "../../config/editorFormats";
import {
  isExtractableArchive,
  type RemoteFileAction,
} from "./fileOperations";

interface MenuItem {
  action: RemoteFileAction;
  label: string;
  icon: LucideIcon;
  dividerBefore?: boolean;
  danger?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  { action: "rename", label: "重命名", icon: Pencil },
  { action: "download", label: "下载", icon: Download },
  { action: "edit", label: "在线编辑", icon: FilePenLine },
  { action: "copyPath", label: "复制路径", icon: Copy },
  { action: "createDirectory", label: "新建文件夹", icon: FolderPlus, dividerBefore: true },
  { action: "createFile", label: "新建文件", icon: FilePlus2 },
  { action: "archive", label: "压缩", icon: Archive, dividerBefore: true },
  { action: "extract", label: "解压", icon: PackageOpen },
  { action: "delete", label: "删除", icon: Trash2, dividerBefore: true, danger: true },
  { action: "permissions", label: "修改权限", icon: ShieldCheck },
];

const DIRECTORY_MENU_ACTIONS = new Set<RemoteFileAction>([
  "copyPath",
  "createDirectory",
  "createFile",
]);
const DIRECTORY_MENU_ITEMS = MENU_ITEMS.filter((item) => (
  DIRECTORY_MENU_ACTIONS.has(item.action)
));

interface Props {
  file: RemoteFile;
  target: "entry" | "directory";
  x: number;
  y: number;
  onAction: (action: RemoteFileAction) => void;
  onClose: () => void;
}

function unavailableReason(action: RemoteFileAction, file: RemoteFile) {
  if (action === "download" && file.directory) {
    return "文件夹暂不支持直接下载，请先压缩";
  }
  if (action === "edit") {
    return remoteTextOpenError(file) ?? undefined;
  }
  if (action === "extract" && !isExtractableArchive(file)) {
    return "仅支持 ZIP、TAR、GZ、BZ2 和 XZ 压缩文件";
  }
  return undefined;
}

export function FileContextMenu({ file, target, x, y, onAction, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const menuItems = target === "directory"
    ? DIRECTORY_MENU_ITEMS
    : MENU_ITEMS;

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const padding = 8;
    const bounds = menu.getBoundingClientRect();
    setPosition({
      x: Math.max(padding, Math.min(x, window.innerWidth - bounds.width - padding)),
      y: Math.max(padding, Math.min(y, window.innerHeight - bounds.height - padding)),
    });
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const closeForWindowChange = () => onClose();
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", closeForWindowChange);
    window.addEventListener("resize", closeForWindowChange);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", closeForWindowChange);
      window.removeEventListener("resize", closeForWindowChange);
    };
  }, [onClose]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const buttons = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
    );
    if (buttons.length === 0) return;
    event.preventDefault();
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Home") buttons[0].focus();
    else if (event.key === "End") buttons[buttons.length - 1].focus();
    else {
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + buttons.length) % buttons.length;
      buttons[nextIndex].focus();
    }
  };

  return (
    <div
      ref={menuRef}
      className="file-context-menu"
      role="menu"
      aria-label={target === "directory" ? "当前目录操作" : `${file.name} 的文件操作`}
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      {menuItems.map((item) => {
        const Icon = item.icon;
        const disabledReason = unavailableReason(item.action, file);
        return (
          <button
            key={item.action}
            className={`file-context-menu-item${item.dividerBefore ? " divided" : ""}${item.danger ? " danger" : ""}`}
            type="button"
            role="menuitem"
            title={disabledReason}
            disabled={Boolean(disabledReason)}
            onClick={() => onAction(item.action)}
          >
            <Icon size={15} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
