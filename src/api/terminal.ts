/**
 * SSH 终端操作 API
 */
import { get, post } from "./request";
import { buildRequestUrl } from "./config";

const BASE = "/api/v1/ssh/terminal";

export interface TerminalOpenPayload {
  connectionId: string;
  cols?: number;
  rows?: number;
}

export interface TerminalOpenResponse {
  sessionId: string;
  connectionId: string;
  initialOutput: string;
}

export interface TerminalExecPayload {
  sessionId: string;
  command: string;
}

export interface TerminalExecResponse {
  output: string;
}

export interface TerminalWritePayload {
  sessionId: string;
  input: string;
}

export interface TerminalReadResponse {
  output: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalWebSocketTicketResponse {
  ticket: string;
  expiresInSeconds: number;
}

export class TerminalWebSocketTicketError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TerminalWebSocketTicketError";
  }
}

export function openTerminal(payload: TerminalOpenPayload) {
  return post<TerminalOpenResponse>(`${BASE}/open`, payload);
}

export function execCommand(payload: TerminalExecPayload) {
  return post<TerminalExecResponse>(`${BASE}/exec`, payload);
}

export function writeInput(payload: TerminalWritePayload) {
  return post<void>(`${BASE}/write`, payload);
}

export function readOutput(sessionId: string) {
  return get<TerminalReadResponse>(`${BASE}/read`, { sessionId });
}

export function resizeTerminal(payload: TerminalResizePayload) {
  return post<void>(`${BASE}/resize`, payload);
}

export function closeTerminal(sessionId: string) {
  return post<void>(`${BASE}/close`, undefined, { sessionId });
}

export async function createTerminalWebSocket(sessionId: string, resumeAfter: number) {
  const response = await post<TerminalWebSocketTicketResponse>(`${BASE}/ws-ticket`, {
    sessionId,
    resumeAfter,
  });
  if (response.code !== "0000" || !response.data?.ticket) {
    throw new TerminalWebSocketTicketError(
      response.code,
      response.info || "无法获取终端连接票据",
    );
  }

  const url = new URL(buildRequestUrl(`${BASE}/ws`));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(url, ["crowssh-terminal", response.data.ticket]);
}
