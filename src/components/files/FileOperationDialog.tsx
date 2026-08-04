import { useEffect, useState } from "react";
import {
  Archive,
  FilePlus2,
  FolderPlus,
  LoaderCircle,
  PackageOpen,
  Pencil,
  ShieldCheck,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import type { RemoteFile } from "../../api/sftp";
import {
  defaultExtractDirectoryName,
  type FileDialogAction,
} from "./fileOperations";

interface DialogDefinition {
  title: string;
  fieldLabel?: string;
  submitLabel: string;
  icon: LucideIcon;
}

const DIALOGS: Record<FileDialogAction, DialogDefinition> = {
  rename: { title: "重命名", fieldLabel: "新名称", submitLabel: "保存名称", icon: Pencil },
  createDirectory: {
    title: "新建文件夹",
    fieldLabel: "文件夹名称",
    submitLabel: "新建文件夹",
    icon: FolderPlus,
  },
  createFile: {
    title: "新建文件",
    fieldLabel: "文件名称",
    submitLabel: "新建文件",
    icon: FilePlus2,
  },
  archive: {
    title: "压缩",
    fieldLabel: "压缩包名称",
    submitLabel: "开始压缩",
    icon: Archive,
  },
  extract: {
    title: "解压",
    fieldLabel: "目标文件夹名称",
    submitLabel: "开始解压",
    icon: PackageOpen,
  },
  delete: { title: "确认删除", submitLabel: "永久删除", icon: Trash2 },
  permissions: {
    title: "修改权限",
    fieldLabel: "八进制权限",
    submitLabel: "保存权限",
    icon: ShieldCheck,
  },
};

interface Props {
  action: FileDialogAction;
  file: RemoteFile;
  basePath: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: string) => void;
}

function initialValue(action: FileDialogAction, file: RemoteFile) {
  switch (action) {
    case "rename":
      return file.name;
    case "createDirectory":
      return "新建文件夹";
    case "createFile":
      return "新建文件";
    case "archive":
      return `${file.name}.tar.gz`;
    case "extract":
      return defaultExtractDirectoryName(file.name);
    case "permissions":
      return file.permissions || (file.directory ? "755" : "644");
    case "delete":
      return "";
  }
}

function validateValue(action: FileDialogAction, file: RemoteFile, value: string) {
  if (action === "delete") return null;
  const normalized = value.trim();
  if (!normalized) return "请输入名称或权限";

  if (action === "permissions") {
    return /^[0-7]{3,4}$/.test(normalized)
      ? null
      : "权限必须是 3 或 4 位八进制数字";
  }
  if (normalized === "." || normalized === ".." || /[\\/\0]/.test(normalized)) {
    return "名称不能是 . 或 ..，也不能包含路径分隔符";
  }
  if (action === "rename" && normalized === file.name) {
    return "名称没有变化";
  }
  if (action === "archive" && !normalized.toLowerCase().endsWith(".tar.gz")) {
    return "压缩包名称必须以 .tar.gz 结尾";
  }
  return null;
}

export function FileOperationDialog({
  action,
  file,
  basePath,
  busy,
  error,
  onClose,
  onSubmit,
}: Props) {
  const definition = DIALOGS[action];
  const Icon = definition.icon;
  const [value, setValue] = useState(() => initialValue(action, file));
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onClose]);

  const submit = () => {
    const nextError = validateValue(action, file, value);
    setValidationError(nextError);
    if (!nextError) onSubmit(value.trim());
  };

  return (
    <div
      className="modal-overlay file-operation-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target && !busy) onClose();
      }}
    >
      <form
        className="modal-card file-operation-dialog"
        role={action === "delete" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby="file-operation-title"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="modal-header">
          <div className="modal-title file-operation-title" id="file-operation-title">
            <Icon size={16} />
            {definition.title}
          </div>
          <button
            className="icon-btn"
            type="button"
            title="关闭"
            aria-label="关闭"
            disabled={busy}
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <div className="modal-body file-operation-body">
          <div className="file-operation-path" title={action === "createDirectory" || action === "createFile" ? basePath : file.path}>
            <span>{action === "createDirectory" || action === "createFile" ? "位置" : "对象"}</span>
            <code>{action === "createDirectory" || action === "createFile" ? basePath : file.path}</code>
          </div>

          {action === "delete" ? (
            <div className="file-delete-warning">
              <strong>确定删除“{file.name}”吗？</strong>
              <span>{file.directory ? "文件夹及其中的全部内容将被永久删除。" : "该文件将被永久删除。"}</span>
            </div>
          ) : (
            <label className="field file-operation-field">
              <span className="field-label">{definition.fieldLabel}</span>
              <input
                className="input"
                type="text"
                inputMode={action === "permissions" ? "numeric" : "text"}
                autoFocus
                maxLength={255}
                spellCheck={false}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setValidationError(null);
                }}
                onFocus={(event) => event.currentTarget.select()}
              />
              {action === "permissions" && (
                <span className="file-operation-hint">当前权限：{file.permissions || "未提供"}</span>
              )}
            </label>
          )}

          {(validationError || error) && (
            <div className="file-operation-error" role="alert">
              {validationError || error}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn" type="button" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button
            className={`btn ${action === "delete" ? "btn-danger" : "btn-primary"}`}
            type="submit"
            disabled={busy}
          >
            {busy ? <LoaderCircle size={14} className="spin" /> : <Icon size={14} />}
            {busy ? "处理中" : definition.submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
