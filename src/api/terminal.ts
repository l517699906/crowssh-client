/**
 * SSH 终端操作 API
 */
import { get, post } from "./request";

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
