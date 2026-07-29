import { buildRequestUrl, get, type ApiResponse } from "./request";

const BASE = "/api/v1/ssh/sftp";

export interface RemoteFile {
  name: string;
  path: string;
  directory: boolean;
  size: number;
  modifiedAt: number;
}

export interface RemoteDirectory {
  path: string;
  files: RemoteFile[];
}

export function listFiles(connectionId: string, path?: string) {
  return get<RemoteDirectory>(`${BASE}/list`, {
    connectionId,
    path: path ?? "",
  });
}

export async function uploadFile(connectionId: string, path: string, file: File) {
  const form = new FormData();
  form.append("connectionId", connectionId);
  form.append("path", path);
  form.append("file", file);

  const response = await fetch(buildRequestUrl(`${BASE}/upload`), {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(response.statusText || `上传失败 (${response.status})`);
  }
  const result = (await response.json()) as ApiResponse<void>;
  if (result.code !== "0000") {
    throw new Error(result.info || "上传失败");
  }
}

export function downloadFile(connectionId: string, file: RemoteFile) {
  const anchor = document.createElement("a");
  anchor.href = buildRequestUrl(`${BASE}/download`, {
    connectionId,
    path: file.path,
  });
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
