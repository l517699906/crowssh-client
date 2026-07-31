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

export interface TransferProgress {
  loaded: number;
  total: number;
}

interface TransferRequestOptions {
  signal?: AbortSignal;
  onProgress?: (progress: TransferProgress) => void;
}

interface UploadRequestOptions extends TransferRequestOptions {
  onUploadComplete?: () => void;
}

export function listFiles(connectionId: string, path?: string) {
  return get<RemoteDirectory>(`${BASE}/list`, {
    connectionId,
    path: path ?? "",
  });
}

function abortError() {
  return new DOMException("传输已取消", "AbortError");
}

function parseApiResponse(text: string): ApiResponse<unknown> | null {
  try {
    const value = JSON.parse(text) as Partial<ApiResponse<unknown>>;
    return typeof value.code === "string" && typeof value.info === "string"
      ? (value as ApiResponse<unknown>)
      : null;
  } catch {
    return null;
  }
}

function responseError(text: string, fallback: string) {
  return new Error(parseApiResponse(text)?.info || fallback);
}

export function uploadFile(
  connectionId: string,
  path: string,
  file: File,
  options: UploadRequestOptions = {},
) {
  const form = new FormData();
  form.append("connectionId", connectionId);
  form.append("path", path);
  form.append("file", file);

  return new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    const handleSignalAbort = () => xhr.abort();
    const cleanup = () => {
      options.signal?.removeEventListener("abort", handleSignalAbort);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (reason: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };

    xhr.open("POST", buildRequestUrl(`${BASE}/upload`));
    options.signal?.addEventListener("abort", handleSignalAbort, { once: true });
    xhr.upload.onprogress = (event) => {
      if (!options.onProgress) return;
      const loaded =
        event.lengthComputable && event.total > 0
          ? Math.round((event.loaded / event.total) * file.size)
          : Math.min(event.loaded, file.size);
      options.onProgress({ loaded: Math.min(loaded, file.size), total: file.size });
    };
    xhr.upload.onload = () => options.onUploadComplete?.();
    xhr.onload = () => {
      const fallback = xhr.statusText || `上传失败 (${xhr.status})`;
      if (xhr.status < 200 || xhr.status >= 300) {
        fail(responseError(xhr.responseText, fallback));
        return;
      }
      const result = parseApiResponse(xhr.responseText);
      if (!result) {
        fail(new Error("服务端返回了无法识别的上传结果"));
        return;
      }
      if (result.code !== "0000") {
        fail(new Error(result.info || "上传失败"));
        return;
      }
      options.onProgress?.({ loaded: file.size, total: file.size });
      succeed();
    };
    xhr.onerror = () => fail(new Error("上传失败：无法连接服务端"));
    xhr.onabort = () => fail(abortError());
    xhr.send(form);
  });
}

export function downloadFile(
  connectionId: string,
  file: RemoteFile,
  options: TransferRequestOptions = {},
) {
  return new Promise<void>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(abortError());
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    const handleSignalAbort = () => xhr.abort();
    const cleanup = () => {
      options.signal?.removeEventListener("abort", handleSignalAbort);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (reason: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(reason);
    };

    xhr.open(
      "GET",
      buildRequestUrl(`${BASE}/download`, {
        connectionId,
        path: file.path,
      }),
    );
    xhr.responseType = "blob";
    options.signal?.addEventListener("abort", handleSignalAbort, { once: true });
    xhr.onprogress = (event) => {
      const total = event.lengthComputable ? event.total : file.size;
      options.onProgress?.({
        loaded: total > 0 ? Math.min(event.loaded, total) : event.loaded,
        total,
      });
    };
    xhr.onload = () => {
      const blob = xhr.response as Blob;
      if (xhr.status < 200 || xhr.status >= 300) {
        const fallback = xhr.statusText || `下载失败 (${xhr.status})`;
        void blob
          .text()
          .then((text) => fail(responseError(text, fallback)))
          .catch(() => fail(new Error(fallback)));
        return;
      }

      const completedSize = blob.size || file.size;
      options.onProgress?.({ loaded: completedSize, total: completedSize });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = file.name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
      succeed();
    };
    xhr.onerror = () => fail(new Error("下载失败：无法连接服务端"));
    xhr.onabort = () => fail(abortError());
    xhr.send();
  });
}
