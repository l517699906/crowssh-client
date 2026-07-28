import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  IBufferLine,
  IDecoration,
  IDisposable,
  ILink,
  IMarker,
  Terminal,
} from "@xterm/xterm";

const URL_PATTERN = /https?:\/\/[^\s<>'"`]+/gi;
const IPV4_PATTERN = /\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g;
const PROMPT_PATTERNS = [
  /^(?:\([^\r\n)]+\)\s*)?\[[^\]\r\n]{1,160}\]\s*[#$%>]\s?/,
  /^(?:\([^\r\n)]+\)\s*)?[\w.-]+@[\w.-]+(?:(?::|\s+)[^\r\n#$%>]{0,160})?[#$%>]\s?/,
  /^(?:\([^\r\n)]+\)\s*)?[\w.-]+:[^\r\n#$%>]{0,160}[#$%>]\s?/,
  /^(?:\([^\r\n)]+\)\s*)?PS\s+[^\r\n>]{1,160}>\s?/i,
  /^(?:\([^\r\n)]+\)\s*)?(?:bash|zsh|fish|ash|dash|ksh|sh)(?:-[\d.]+)?[#$%>]\s?/i,
  /^(?:\([^\r\n)]+\)\s*)?[\w.-]+[#$>]\s?/,
  /^(?:\([^\r\n)]+\)\s*)?(?:[A-Za-z]:[\\/]|[~/.\\])[^\r\n#$%>]{0,160}[#$%>]\s?/,
  /^(?:\([^\r\n)]+\)\s*)?(?:[└╰][─━-]*|[➜❯λ▶»])\s*(?:[#$%>❯➜λ▶»]\s*)?/,
  /^(?:\([^\r\n)]+\)\s*)?[#$%>]\s+/,
];
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
const FILE_LISTING_COMMAND_PATTERN = /^(?:sudo\s+)?(?:(?:\S+\/)?(?:ls|ll|la|tree|find|fd|fdfind)\b|rg\s+--files\b)/;
const LONG_LISTING_PATTERN = /^([bcdlps-][rwxStTs-]{9}[.+@]?)\s+\d+\s+\S+\s+\S+\s+(?:\d+|\d+,\s*\d+)\s+(?:(?:\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}|\S+\s+\d{1,2}\s+(?:\d{2}:\d{2}|\d{4}))\s+(.+)$/;
const TREE_PREFIX_PATTERN = /^(?:\s*[│ ]*)?(?:├──|└──|`--|\|--)\s+(.+)$/;
const FILE_TOKEN_PATTERN = /\S+/g;
const MAX_FILE_LISTING_RANGES = 50;
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

type FileCategory =
  | "directory"
  | "executable"
  | "symlink"
  | "archive"
  | "media"
  | "source"
  | "config"
  | "log";

const FILE_COLORS: Record<"dark" | "light", Record<FileCategory, string>> = {
  dark: {
    directory: "#D7C77A",
    executable: "#7FCB8A",
    symlink: "#72C7C7",
    archive: "#C58AB7",
    media: "#D99A6C",
    source: "#9FA8DA",
    config: "#AAB2BD",
    log: "#B9A58B",
  },
  light: {
    directory: "#7A6518",
    executable: "#287A3B",
    symlink: "#1E6F73",
    archive: "#7A3F6A",
    media: "#8A4E28",
    source: "#4C5898",
    config: "#5F6773",
    log: "#6E5A42",
  },
};

const FILE_EXTENSIONS: Array<[FileCategory, Set<string>]> = [
  ["archive", new Set(["7z", "bz2", "gz", "rar", "tar", "tgz", "xz", "zip"])],
  ["media", new Set(["aac", "avi", "flac", "gif", "jpeg", "jpg", "m4a", "mkv", "mov", "mp3", "mp4", "ogg", "png", "svg", "wav", "webm", "webp"])],
  ["source", new Set(["c", "cc", "cpp", "cs", "css", "go", "h", "hpp", "html", "java", "js", "jsx", "kt", "kts", "php", "py", "rb", "rs", "scss", "sh", "sql", "swift", "tsx", "ts", "vue"])],
  ["config", new Set(["conf", "config", "env", "ini", "json", "properties", "toml", "xml", "yaml", "yml"])],
  ["log", new Set(["log", "out", "trace"])],
];

interface SemanticMatch {
  start: number;
  end: number;
  color: string;
}

interface ActiveDecoration {
  decoration: IDecoration;
  marker: IMarker;
}

interface FileListingRange {
  start: IMarker;
  end?: IMarker;
}

function rangesOverlap(left: SemanticMatch, right: SemanticMatch): boolean {
  return left.start < right.end && left.end > right.start;
}

function currentFileColors(): Record<FileCategory, string> {
  return FILE_COLORS[document.documentElement.dataset.theme === "light" ? "light" : "dark"];
}

function normalizeFileName(value: string): string {
  const arrowIndex = value.indexOf(" -> ");
  const name = (arrowIndex >= 0 ? value.slice(0, arrowIndex) : value).replace(/[*/@|=]$/, "");
  return name.split("/").pop()?.toLowerCase() ?? name.toLowerCase();
}

function classifyFile(value: string, typeHint?: string): FileCategory | undefined {
  if (typeHint === "d" || value.endsWith("/")) return "directory";
  if (typeHint === "l" || value.includes(" -> ") || value.endsWith("@")) return "symlink";
  if (typeHint?.slice(1).includes("x") || value.endsWith("*")) return "executable";

  const name = normalizeFileName(value);
  if (["dockerfile", "makefile", "jenkinsfile"].includes(name)) return "config";
  if (name.startsWith(".env") || name.endsWith(".config.js") || name.endsWith(".config.ts")) {
    return "config";
  }
  if (/\.(?:tar\.(?:gz|bz2|xz))$/i.test(name)) return "archive";
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return FILE_EXTENSIONS.find(([, extensions]) => extensions.has(extension))?.[0];
}

function fileMatch(start: number, value: string, category: FileCategory): SemanticMatch {
  return {
    start,
    end: start + value.length,
    color: currentFileColors()[category],
  };
}

function collectFileMatches(text: string): SemanticMatch[] {
  const longListing = LONG_LISTING_PATTERN.exec(text);
  if (longListing) {
    const value = longListing[2];
    const start = text.lastIndexOf(value);
    const category = classifyFile(value, longListing[1]);
    return category ? [fileMatch(start, value, category)] : [];
  }

  const treeEntry = TREE_PREFIX_PATTERN.exec(text);
  if (treeEntry) {
    const value = treeEntry[1];
    const start = text.lastIndexOf(value);
    const category = classifyFile(value);
    return category ? [fileMatch(start, value, category)] : [];
  }

  const matches: SemanticMatch[] = [];
  for (const token of text.matchAll(FILE_TOKEN_PATTERN)) {
    const category = classifyFile(token[0]);
    if (category) matches.push(fileMatch(token.index, token[0], category));
  }
  return matches;
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

  const prompt = matchPrompt(text);
  if (prompt) add(0, prompt.length, SEMANTIC_COLORS.prompt);

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

  return matches;
}

function matchPrompt(text: string): string | undefined {
  for (const pattern of PROMPT_PATTERNS) {
    const match = pattern.exec(text);
    if (match) return match[0];
  }
  return undefined;
}

function rangeUsesDefaultForeground(line: IBufferLine, start: number, end: number) {
  for (let column = start; column < end; column += 1) {
    const cell = line.getCell(column);
    if (cell && !cell.isFgDefault()) return false;
  }
  return true;
}

function stringIndexToColumn(line: IBufferLine, stringIndex: number): number {
  if (stringIndex <= 0) return 0;
  let consumed = 0;
  for (let column = 0; column < line.length; column += 1) {
    const cell = line.getCell(column);
    if (!cell || cell.getWidth() === 0) continue;
    const next = consumed + (cell.getChars() || " ").length;
    if (stringIndex < next) return column;
    if (stringIndex === next) {
      return Math.min(column + Math.max(cell.getWidth(), 1), line.length);
    }
    consumed = next;
  }
  return line.length;
}

function getLinks(term: Terminal, lineNumber: number): ILink[] | undefined {
  const lineIndex = lineNumber - 1;
  const line = term.buffer.active.getLine(lineIndex);
  if (!line) return undefined;
  const text = line.translateToString(true);
  if (!text) return undefined;

  const links = Array.from(text.matchAll(URL_PATTERN), (match) => {
    const value = match[0].replace(TRAILING_URL_PUNCTUATION, "");
    const start = stringIndexToColumn(line, match.index);
    const end = stringIndexToColumn(line, match.index + value.length);
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
  let pendingInput = "";
  let fileListingRanges: FileListingRange[] = [];
  let activeFileListing: FileListingRange | null = null;

  const disposeFileListingRange = (range: FileListingRange) => {
    range.start.dispose();
    range.end?.dispose();
  };

  const closeActiveFileListing = (cursorYOffset: number) => {
    if (!activeFileListing || activeFileListing.start.isDisposed) {
      activeFileListing = null;
      return;
    }
    activeFileListing.end = term.registerMarker(cursorYOffset);
    activeFileListing = null;
  };

  const pruneFileListingRanges = () => {
    fileListingRanges = fileListingRanges.filter((range) => {
      if (!range.start.isDisposed && !range.end?.isDisposed) return true;
      disposeFileListingRange(range);
      if (activeFileListing === range) activeFileListing = null;
      return false;
    });
    while (fileListingRanges.length > MAX_FILE_LISTING_RANGES) {
      const range = fileListingRanges.shift();
      if (range) disposeFileListingRange(range);
    }
  };

  const trackInput = (data: string) => {
    if (data.startsWith("\x1b")) return;
    for (const character of data) {
      if (character === "\r" || character === "\n") {
        const buffer = term.buffer.active;
        if (buffer.type === "normal") {
          closeActiveFileListing(0);
          if (FILE_LISTING_COMMAND_PATTERN.test(pendingInput.trim())) {
            const range = { start: term.registerMarker(1) };
            fileListingRanges.push(range);
            activeFileListing = range;
            pruneFileListingRanges();
          }
        }
        pendingInput = "";
      } else if (character === "\x7f" || character === "\b") {
        pendingInput = pendingInput.slice(0, -1);
      } else if (character === "\x03" || character === "\x15") {
        pendingInput = "";
      } else if (character >= " ") {
        pendingInput += character;
      }
    }
  };

  const render = () => {
    for (const item of decorations) {
      item.decoration.dispose();
      item.marker.dispose();
    }
    decorations = [];

    const buffer = term.buffer.active;
    if (buffer.type === "alternate") return;
    pruneFileListingRanges();

    const firstLine = buffer.viewportY;
    const lastLine = Math.min(buffer.length - 1, firstLine + term.rows - 1);
    const cursorLine = buffer.baseY + buffer.cursorY;
    for (let lineIndex = firstLine; lineIndex <= lastLine; lineIndex += 1) {
      const line = buffer.getLine(lineIndex);
      if (!line || line.isWrapped) continue;
      const text = line.translateToString(true);
      if (!text) continue;

      const matches = collectMatches(text);
      if (
        activeFileListing &&
        lineIndex >= activeFileListing.start.line &&
        matchPrompt(text)
      ) {
        closeActiveFileListing(lineIndex - cursorLine);
      }
      const isFileListingLine = fileListingRanges.some(
        (range) =>
          lineIndex >= range.start.line &&
          (!range.end || lineIndex < range.end.line),
      );
      if (isFileListingLine) {
        for (const match of collectFileMatches(text)) {
          if (!matches.some((semantic) => rangesOverlap(match, semantic))) matches.push(match);
        }
      }

      for (const match of matches) {
        const startColumn = stringIndexToColumn(line, match.start);
        const endColumn = stringIndexToColumn(line, match.end);
        if (endColumn <= startColumn) continue;
        if (!rangeUsesDefaultForeground(line, startColumn, endColumn)) continue;
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

  const inputDisposable = term.onData(trackInput);
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
      inputDisposable.dispose();
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
      for (const range of fileListingRanges) disposeFileListingRange(range);
      fileListingRanges = [];
      activeFileListing = null;
    },
  };
}
