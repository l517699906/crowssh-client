import { buildRequestUrl, type ApiResponse } from "./request";
import { fetchWithDeviceAuthorization } from "./deviceIdentity";

const BASE = "/api/v1/ssh/sftp/content";
const REQUEST_TIMEOUT_MS = 60_000;

export type TextEncoding = "UTF-8" | "UTF-8-BOM" | "UTF-16LE" | "UTF-16BE";
export type LineEnding = "LF" | "CRLF" | "CR";

export interface RemoteTextDocument {
  path: string;
  content: string;
  version: string;
  encoding: TextEncoding;
  lineEnding: LineEnding;
  size: number;
  modifiedAt: number;
}

export interface SaveRemoteTextInput {
  connectionId: string;
  path: string;
  content: string;
  version: string;
  encoding: TextEncoding;
  lineEnding: LineEnding;
}

export class SftpTextConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SftpTextConflictError";
  }
}

async function requestDocument(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchWithDeviceAuthorization(url, {
      ...init,
      signal: controller.signal,
    });
    const text = await response.text();
    let result: ApiResponse<RemoteTextDocument> | null = null;
    try {
      result = JSON.parse(text) as ApiResponse<RemoteTextDocument>;
    } catch {
      // 后续统一给出更明确的协议错误。
    }

    const message = result?.info || response.statusText || "远程文件请求失败";
    if (response.status === 409 || result?.code === "SFTP_CONFLICT") {
      throw new SftpTextConflictError(message);
    }
    if (response.status === 404) {
      throw new Error("当前服务端尚未加载远程文本编辑接口，请重启或更新 CrowSSH 服务端");
    }
    if (!response.ok) throw new Error(message);
    if (!result || result.code !== "0000" || !result.data) {
      throw new Error(result?.info || "服务端返回了无法识别的文件内容");
    }
    return result.data;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "AbortError") {
      throw new Error("远程文件请求超时");
    }
    if (reason instanceof TypeError) {
      throw new Error("无法连接 CrowSSH 服务，请确认服务端已经启动");
    }
    throw reason;
  } finally {
    window.clearTimeout(timer);
  }
}

export function readRemoteText(connectionId: string, path: string) {
  return requestDocument(buildRequestUrl(BASE, { connectionId, path }));
}

export function saveRemoteText(input: SaveRemoteTextInput) {
  return requestDocument(buildRequestUrl(BASE), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
