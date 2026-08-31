const STORAGE_KEY = "crowssh:terminal-diagnostics:v1";
const MAX_EVENTS = 200;
const MAX_DETAIL_LENGTH = 200;

export interface TerminalDiagnosticEvent {
  timestamp: string;
  event: string;
  frontendSessionId: string;
  backendSessionId?: string;
  details?: Record<string, string | number | boolean>;
}

function sanitizeDetails(
  details: Record<string, string | number | boolean | null | undefined> | undefined,
) {
  if (!details) return undefined;
  const sanitized: Record<string, string | number | boolean> = {};
  Object.entries(details).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    sanitized[key] = typeof value === "string"
      ? value.replace(/[\r\n]/g, " ").slice(0, MAX_DETAIL_LENGTH)
      : value;
  });
  return sanitized;
}

export function recordTerminalDiagnostic(
  event: Omit<TerminalDiagnosticEvent, "timestamp" | "details"> & {
    details?: Record<string, string | number | boolean | null | undefined>;
  },
) {
  if (typeof localStorage === "undefined") return;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    const events: TerminalDiagnosticEvent[] = Array.isArray(parsed) ? parsed : [];
    events.push({
      ...event,
      timestamp: new Date().toISOString(),
      details: sanitizeDetails(event.details),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // 诊断日志不能影响终端主链路。
  }
}

export function getTerminalDiagnostics(): TerminalDiagnosticEvent[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
