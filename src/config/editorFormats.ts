import type { RemoteFile } from "../api/sftp";

export const MAX_REMOTE_TEXT_FILE_SIZE = 2 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  "bash",
  "c",
  "cc",
  "cfg",
  "cmake",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "cxx",
  "editorconfig",
  "env",
  "fish",
  "gitignore",
  "go",
  "gradle",
  "graphql",
  "gql",
  "h",
  "hpp",
  "htm",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsonc",
  "jsx",
  "kt",
  "kts",
  "less",
  "log",
  "lua",
  "md",
  "markdown",
  "mk",
  "php",
  "properties",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svelte",
  "svg",
  "swift",
  "toml",
  "ts",
  "tsv",
  "tsx",
  "txt",
  "vue",
  "xml",
  "yaml",
  "yml",
  "zsh",
]);

const TEXT_FILE_NAMES = new Set([
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  "cmakelists.txt",
  "dockerfile",
  "gemfile",
  "license",
  "makefile",
  "procfile",
  "readme",
]);

export function remoteTextOpenError(file: RemoteFile): string | null {
  if (file.directory) return "目录不能使用文本编辑器打开";
  if (file.size > MAX_REMOTE_TEXT_FILE_SIZE) {
    return "文本编辑器暂只支持不超过 2 MB 的文件";
  }

  const name = file.name.toLowerCase();
  if (TEXT_FILE_NAMES.has(name) || name.startsWith(".env")) return null;
  const extension = name.includes(".") ? name.split(".").pop() ?? "" : "";
  return TEXT_EXTENSIONS.has(extension)
    ? null
    : `暂不支持使用文本编辑器打开 ${file.name}`;
}

export function isRemoteTextFile(file: RemoteFile) {
  return remoteTextOpenError(file) === null;
}
