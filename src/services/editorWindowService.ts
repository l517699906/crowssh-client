export const REMOTE_TEXT_SAVED_EVENT = "sftp-text-saved";

export interface RemoteEditorTarget {
  connectionId: string;
  path: string;
  fileName: string;
  serverName: string;
}

export interface RemoteTextSavedEvent {
  connectionId: string;
  path: string;
  size: number;
  modifiedAt: number;
}

async function windowLabel(target: RemoteEditorTarget) {
  const source = new TextEncoder().encode(`${target.connectionId}\0${target.path}`);
  const digest = await crypto.subtle.digest("SHA-256", source);
  const suffix = Array.from(new Uint8Array(digest).slice(0, 12), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  return `editor-${suffix}`;
}

function editorUrl(target: RemoteEditorTarget) {
  const params = new URLSearchParams({
    connectionId: target.connectionId,
    path: target.path,
    fileName: target.fileName,
    serverName: target.serverName,
  });
  return `/editor.html?${params.toString()}`;
}

function openBrowserWindow(label: string, target: RemoteEditorTarget) {
  const editor = window.open(
    editorUrl(target),
    label,
    "popup=yes,width=1060,height=720,resizable=yes,scrollbars=no",
  );
  if (!editor) throw new Error("编辑器窗口被浏览器拦截，请允许打开新窗口");
  editor.focus();
}

export async function openRemoteTextEditor(target: RemoteEditorTarget) {
  const label = await windowLabel(target);
  const { isTauri } = await import("@tauri-apps/api/core");
  if (!isTauri()) {
    openBrowserWindow(label, target);
    return;
  }

  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel(label);
  if (existing) {
    await existing.unminimize();
    await existing.show();
    await existing.setFocus();
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const editor = new WebviewWindow(label, {
      url: editorUrl(target),
      title: `${target.fileName} - CrowSSH`,
      width: 1060,
      height: 720,
      minWidth: 720,
      minHeight: 480,
      center: true,
      focus: true,
      resizable: true,
    });
    void editor.once("tauri://created", () => resolve());
    void editor.once<unknown>("tauri://error", (event) => {
      reject(new Error(`无法创建编辑器窗口: ${String(event.payload)}`));
    });
  });
}
