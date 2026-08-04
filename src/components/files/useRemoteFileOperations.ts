import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  archiveRemoteEntry,
  changeRemotePermissions,
  createRemoteDirectory,
  createRemoteFile,
  deleteRemoteEntry,
  extractRemoteArchive,
  renameRemoteEntry,
  type RemoteFile,
} from "../../api/sftp";
import { remoteTextOpenError } from "../../config/editorFormats";
import {
  isDialogAction,
  type FileDialogAction,
  type RemoteFileAction,
} from "./fileOperations";

export interface FileOperationDialogState {
  action: FileDialogAction;
  file: RemoteFile;
  basePath: string;
}

interface Options {
  scopeId?: string;
  connectionId?: string;
  currentPath: string;
  onRefresh: () => Promise<void>;
  onDownload: (file: RemoteFile) => void;
  onEdit: (file: RemoteFile) => Promise<void>;
  onError: (message: string | null) => void;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("复制路径失败，请检查剪贴板权限");
  }
}

export function useRemoteFileOperations({
  scopeId,
  connectionId,
  currentPath,
  onRefresh,
  onDownload,
  onEdit,
  onError,
}: Options) {
  const [dialog, setDialog] = useState<FileOperationDialogState | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const scopeKey = `${scopeId ?? ""}\0${connectionId ?? ""}\0${currentPath}`;
  const scopeKeyRef = useRef(scopeKey);
  const operationTokenRef = useRef(0);
  if (scopeKeyRef.current !== scopeKey) {
    scopeKeyRef.current = scopeKey;
    operationTokenRef.current += 1;
  }

  useLayoutEffect(() => {
    setDialog(null);
    setBusy(false);
    setDialogError(null);
    setNotice(null);
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  }, [scopeKey]);

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message: string) => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 2_800);
  }, []);

  const openAction = useCallback(async (file: RemoteFile, action: RemoteFileAction) => {
    const actionScope = scopeKey;
    onError(null);
    setDialogError(null);

    if (action === "download") {
      if (file.directory) {
        onError("文件夹暂不支持直接下载，请先压缩");
        return;
      }
      onDownload(file);
      showNotice(`已将“${file.name}”加入下载队列`);
      return;
    }

    if (action === "edit") {
      const reason = remoteTextOpenError(file);
      if (reason) {
        onError(reason);
        return;
      }
      await onEdit(file);
      return;
    }

    if (action === "copyPath") {
      try {
        await copyText(file.path);
        if (scopeKeyRef.current === actionScope) showNotice("远程路径已复制");
      } catch (reason) {
        if (scopeKeyRef.current === actionScope) {
          onError(reason instanceof Error ? reason.message : String(reason));
        }
      }
      return;
    }

    if (isDialogAction(action)) {
      const basePath = (action === "createDirectory" || action === "createFile")
        && file.directory
        ? file.path
        : currentPath;
      setDialog({ action, file, basePath });
    }
  }, [currentPath, onDownload, onEdit, onError, scopeKey, showNotice]);

  const closeDialog = useCallback(() => {
    if (busy) return;
    setDialog(null);
    setDialogError(null);
  }, [busy]);

  const submitDialog = useCallback(async (value: string) => {
    if (!connectionId || !dialog || busy) return;
    setBusy(true);
    setDialogError(null);
    onError(null);
    const operationToken = ++operationTokenRef.current;

    try {
      const { action, file, basePath } = dialog;
      const response = await (() => {
        switch (action) {
          case "rename":
            return renameRemoteEntry(connectionId, file.path, value);
          case "createDirectory":
            return createRemoteDirectory(connectionId, basePath, value);
          case "createFile":
            return createRemoteFile(connectionId, basePath, value);
          case "archive":
            return archiveRemoteEntry(connectionId, file.path, value);
          case "extract":
            return extractRemoteArchive(connectionId, file.path, value);
          case "delete":
            return deleteRemoteEntry(connectionId, file.path);
          case "permissions":
            return changeRemotePermissions(connectionId, file.path, value);
        }
      })();

      if (response.code !== "0000") {
        throw new Error(response.info || "远程文件操作失败");
      }
      if (operationTokenRef.current !== operationToken
          || scopeKeyRef.current !== scopeKey) return;

      await onRefresh();
      if (operationTokenRef.current !== operationToken
          || scopeKeyRef.current !== scopeKey) return;
      setDialog(null);
      const successMessage = (() => {
        switch (action) {
          case "rename": return `已重命名为“${value}”`;
          case "createDirectory": return `文件夹“${value}”已创建`;
          case "createFile": return `文件“${value}”已创建`;
          case "archive": return `压缩包“${value}”已创建`;
          case "extract": return `已解压到“${value}”`;
          case "delete": return `“${file.name}”已删除`;
          case "permissions": return `“${file.name}”权限已修改为 ${value}`;
        }
      })();
      showNotice(successMessage);
    } catch (reason) {
      if (operationTokenRef.current === operationToken
          && scopeKeyRef.current === scopeKey) {
        setDialogError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (operationTokenRef.current === operationToken
          && scopeKeyRef.current === scopeKey) {
        setBusy(false);
      }
    }
  }, [busy, connectionId, dialog, onError, onRefresh, scopeKey, showNotice]);

  return {
    dialog,
    busy,
    dialogError,
    notice,
    openAction,
    closeDialog,
    submitDialog,
  };
}
