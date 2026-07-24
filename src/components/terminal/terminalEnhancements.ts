import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  IDecoration,
  IDisposable,
  ILink,
  IMarker,
  Terminal,
} from "@xterm/xterm";

const URL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi;
const IPV4_PATTERN = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const PROMPT_PATTERN = /^(?:\([^\r\n]+\)\s*)?(?:[\w.-]+@)?[\w.-]+(?::[^\r\n]*?)?[#$%>]\s?/;
const TRAILING_URL_PUNCTUATION = /[),.;!?\]}]+$/;
const ERROR_PATTERN = /\b(?:error|fail(?:ed|ure)?|fatal|panic|exception|permission denied|denied)\b/gi;
const WARNING_PATTERN = /\b(?:warning|warn|deprecated|retry(?:ing)?|timeout|timed out)\b/gi;
const SUCCESS_PATTERN = /\b(?:success|succeeded|completed|done|ok|passed)\b/gi;
const HTTP_STATUS_PATTERN = /(?:HTTP\/\d(?:\.\d)?\s+|(?:status|code)\s*[=:]?\s*)([1-5]\d{2})\b/gi;
const TIMESTAMP_PATTERN = /\b(?:\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?|\d{2}:\d{2}:\d{2})\b/g;
const FILE_LOCATION_PATTERN = /(?:\/(?:[\w.@~+%-]+\/)*[\w.@~+%-]+):(\d+)(?::\d+)?/g;
const ENDPOINT_PORT_PATTERN = /\b(?:\d{1,3}(?:\.\d{1,3}){3}|(?:[a-z0-9-]+\.)+[a-z]{2,}|localhost):(\d{2,5})\b/gi;
const GIT_HASH_PATTERN = /\b(?:commit|HEAD(?:\s+is\s+now\s+at)?)\s+([0-9a-f]{7,40})\b/gi;
const GIT_BRANCH_PATTERN = /(?:On branch\s+|git:\()([\w./-]+)\)?/g;
const PROCESS_ID_PATTERN = /\bpid\s*[=: ]\s*(\d+)\b/gi;
const CONTAINER_ID_PATTERN = /\b(?:container|docker)(?:[ _-]?(?:id|container))?\s*[=: ]\s*([a-f0-9]{12,64})\b/gi;
const RESOURCE_PATTERN = /\b(?:cpu|memory|mem(?:ory)?|disk|usage)\b[^\r\n%]{0,24}?(\d+(?:\.\d+)?)%/gi;
const SEMANTIC_COLORS = {
  url: "#0078FF",
  ip: "#008FBC",
  prompt: "#00A843",
  error: "#FF3B30",
  warning: "#FFB000",
  success: "#00B85A",
  timestamp: "#A855F7",
  fileLocation: "#B26BFF",
  port: "#FF8A00",
  git: "#FF4FD8",
  process: "#00B7FF",
  container: "#00A8E8",
};

interface SemanticMatch {
  start: number;
  end: number;
  color: string;
}

interface ActiveDecoration {
  decoration: IDecoration;
  marker: IMarker;
}

export interface TerminalEnhancements extends IDisposable {
  refresh: () => void;
}

function collectMatches(text: string): SemanticMatch[] {
  const matches: SemanticMatch[] = [];

  const add = (start: number, end: number, color: string) => {
    if (start >= end || matches.some((item) => start < item.end && end > item.start)) return;
    matches.push({ start, end, color });
  };

  const addCaptured = (pattern: RegExp, color: string) => {
    for (const match of text.matchAll(pattern)) {
      const value = match[1];
      if (!value) continue;
      const start = match.index + match[0].lastIndexOf(value);
      add(start, start + value.length, color);
    }
  };

  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0];
    const value = raw.replace(TRAILING_URL_PUNCTUATION, "");
    const start = match.index;
    const end = start + value.length;
    add(start, end, SEMANTIC_COLORS.url);
  }

  for (const match of text.matchAll(FILE_LOCATION_PATTERN)) {
    add(match.index, match.index + match[0].length, SEMANTIC_COLORS.fileLocation);
  }

  for (const match of text.matchAll(TIMESTAMP_PATTERN)) {
    add(match.index, match.index + match[0].length, SEMANTIC_COLORS.timestamp);
  }

  for (const match of text.matchAll(CONTAINER_ID_PATTERN)) {
    const value = match[1];
    const start = match.index + match[0].lastIndexOf(value);
    add(start, start + value.length, SEMANTIC_COLORS.container);
  }

  addCaptured(GIT_HASH_PATTERN, SEMANTIC_COLORS.git);
  addCaptured(GIT_BRANCH_PATTERN, SEMANTIC_COLORS.git);
  addCaptured(PROCESS_ID_PATTERN, SEMANTIC_COLORS.process);

  for (const match of text.matchAll(RESOURCE_PATTERN)) {
    const value = Number(match[1]);
    const start = match.index + match[0].lastIndexOf(match[1]);
    add(
      start,
      start + match[1].length,
      value >= 90 ? SEMANTIC_COLORS.error : value >= 70 ? SEMANTIC_COLORS.warning : SEMANTIC_COLORS.success,
    );
  }

  for (const match of text.matchAll(HTTP_STATUS_PATTERN)) {
    const value = match[1];
    const start = match.index + match[0].lastIndexOf(value);
    const status = Number(value);
    add(
      start,
      start + value.length,
      status >= 500 ? SEMANTIC_COLORS.error : status >= 400 ? SEMANTIC_COLORS.warning : status >= 300 ? SEMANTIC_COLORS.url : SEMANTIC_COLORS.success,
    );
  }

  for (const match of text.matchAll(ERROR_PATTERN)) {
    add(match.index, match.index + match[0].length, SEMANTIC_COLORS.error);
  }

  for (const match of text.matchAll(WARNING_PATTERN)) {
    add(match.index, match.index + match[0].length, SEMANTIC_COLORS.warning);
  }

  for (const match of text.matchAll(SUCCESS_PATTERN)) {
    add(match.index, match.index + match[0].length, SEMANTIC_COLORS.success);
  }

  for (const match of text.matchAll(IPV4_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    add(start, end, SEMANTIC_COLORS.ip);
  }

  addCaptured(ENDPOINT_PORT_PATTERN, SEMANTIC_COLORS.port);

  const prompt = PROMPT_PATTERN.exec(text);
  if (prompt) {
    add(0, prompt[0].length, SEMANTIC_COLORS.prompt);
  }

  return matches;
}

function rangeUsesDefaultForeground(term: Terminal, lineIndex: number, start: number, end: number) {
  const line = term.buffer.active.getLine(lineIndex);
  if (!line) return false;
  for (let column = start; column < end; column += 1) {
    const cell = line.getCell(column);
    if (cell && !cell.isFgDefault()) return false;
  }
  return true;
}

function stringIndexToColumn(term: Terminal, lineIndex: number, stringIndex: number): number {
  const line = term.buffer.active.getLine(lineIndex);
  if (!line || stringIndex <= 0) return 0;
  let consumed = 0;
  for (let column = 0; column < line.length; column += 1) {
    const cell = line.getCell(column);
    if (!cell || cell.getWidth() === 0) continue;
    const next = consumed + cell.getChars().length;
    if (next > stringIndex) return column;
    consumed = next;
  }
  return Math.min(stringIndex, line.length);
}

function getLinks(term: Terminal, lineNumber: number): ILink[] | undefined {
  const lineIndex = lineNumber - 1;
  const text = term.buffer.active.getLine(lineIndex)?.translateToString(true);
  if (!text) return undefined;

  const links = Array.from(text.matchAll(URL_PATTERN), (match) => {
    const value = match[0].replace(TRAILING_URL_PUNCTUATION, "");
    const start = stringIndexToColumn(term, lineIndex, match.index);
    const end = stringIndexToColumn(term, lineIndex, match.index + value.length);
    return {
      text: value,
      range: {
        start: { x: start + 1, y: lineNumber },
        end: { x: end, y: lineNumber },
      },
      decorations: { pointerCursor: true, underline: true },
      activate: (event: MouseEvent, url: string) => {
        if (event.ctrlKey || event.metaKey) void openUrl(url);
      },
    } satisfies ILink;
  });

  return links.length > 0 ? links : undefined;
}

export function installTerminalEnhancements(
  term: Terminal,
): TerminalEnhancements {
  let decorations: ActiveDecoration[] = [];

  const render = () => {
    for (const item of decorations) {
      item.decoration.dispose();
      item.marker.dispose();
    }
    decorations = [];

    const buffer = term.buffer.active;
    if (buffer.type === "alternate") return;

    const firstLine = buffer.viewportY;
    const lastLine = Math.min(buffer.length - 1, firstLine + term.rows - 1);
    const cursorLine = buffer.baseY + buffer.cursorY;
    for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (!line || line.isWrapped) continue;
      const text = line.translateToString(true);
      if (!text) continue;

      for (const match of collectMatches(text)) {
        const startColumn = stringIndexToColumn(term, lineIndex, match.start);
        const endColumn = stringIndexToColumn(term, lineIndex, match.end);
        if (!rangeUsesDefaultForeground(term, lineIndex, startColumn, endColumn)) continue;
        const marker = term.registerMarker(lineIndex - cursorLine);
        if (!marker) continue;
        const decoration = term.registerDecoration({
          marker,
          x: startColumn,
          width: endColumn - startColumn,
          foregroundColor: match.color,
          layer: "top",
        });
        if (decoration) decorations.push({ decoration, marker });
        else marker.dispose();
      }
    }
  };

  const writeDisposable = term.onWriteParsed(render);
  const scrollDisposable = term.onScroll(render);
  const resizeDisposable = term.onResize(render);
  const bufferDisposable = term.buffer.onBufferChange(render);
  const linkDisposable = term.registerLinkProvider({
    provideLinks: (lineNumber, callback) => callback(getLinks(term, lineNumber)),
  });

  return {
    refresh: render,
    dispose: () => {
      writeDisposable.dispose();
      scrollDisposable.dispose();
      resizeDisposable.dispose();
      bufferDisposable.dispose();
      linkDisposable.dispose();
      for (const item of decorations) {
        item.decoration.dispose();
        item.marker.dispose();
      }
      decorations = [];
    },
  };
}
