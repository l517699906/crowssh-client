export type TerminalServerFrame =
  | { type: "ready"; sessionId: string; serverSeq: number; replayTruncated: boolean }
  | { type: "output"; serverSeq: number; data: string }
  | { type: "input_ack"; clientSeq: number }
  | { type: "ping" | "pong"; timestamp: number }
  | { type: "error"; code: string; message: string }
  | { type: "terminal_closed"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseTerminalServerFrame(payload: string): TerminalServerFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "ready":
      return typeof value.sessionId === "string" &&
        typeof value.serverSeq === "number" &&
        typeof value.replayTruncated === "boolean"
        ? {
            type: "ready",
            sessionId: value.sessionId,
            serverSeq: value.serverSeq,
            replayTruncated: value.replayTruncated,
          }
        : null;
    case "output":
      return typeof value.serverSeq === "number" && typeof value.data === "string"
        ? { type: "output", serverSeq: value.serverSeq, data: value.data }
        : null;
    case "input_ack":
      return typeof value.clientSeq === "number"
        ? { type: "input_ack", clientSeq: value.clientSeq }
        : null;
    case "ping":
    case "pong":
      return typeof value.timestamp === "number"
        ? { type: value.type, timestamp: value.timestamp }
        : null;
    case "error":
      return typeof value.code === "string" && typeof value.message === "string"
        ? { type: "error", code: value.code, message: value.message }
        : null;
    case "terminal_closed":
      return typeof value.message === "string"
        ? { type: "terminal_closed", message: value.message }
        : null;
    default:
      return null;
  }
}

export function terminalInputFrame(clientSeq: number, data: string) {
  return JSON.stringify({ type: "input", clientSeq, data });
}

export function terminalResizeFrame(cols: number, rows: number) {
  return JSON.stringify({ type: "resize", cols, rows });
}

export function terminalAckFrame(serverSeq: number) {
  return JSON.stringify({ type: "ack", serverSeq });
}

export function terminalHeartbeatFrame(type: "ping" | "pong", timestamp: number) {
  return JSON.stringify({ type, timestamp });
}
