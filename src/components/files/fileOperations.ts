import type { RemoteFile } from "../../api/sftp";

export type RemoteFileAction =
  | "rename"
  | "download"
  | "edit"
  | "copyPath"
  | "createDirectory"
  | "createFile"
  | "archive"
  | "extract"
  | "delete"
  | "permissions";

export type FileDialogAction = Exclude<
  RemoteFileAction,
  "download" | "edit" | "copyPath"
>;

const ARCHIVE_SUFFIXES = [
  ".tar.bz2",
  ".tar.gz",
  ".tar.xz",
  ".tbz2",
  ".tgz",
  ".tbz",
  ".txz",
  ".zip",
  ".tar",
  ".bz2",
  ".gz",
  ".xz",
] as const;

export function isDialogAction(action: RemoteFileAction): action is FileDialogAction {
  return action !== "download" && action !== "edit" && action !== "copyPath";
}

export function isExtractableArchive(file: RemoteFile) {
  if (file.directory) return false;
  const name = file.name.toLowerCase();
  return ARCHIVE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

export function defaultExtractDirectoryName(name: string) {
  const lowerName = name.toLowerCase();
  const suffix = ARCHIVE_SUFFIXES.find((candidate) => lowerName.endsWith(candidate));
  if (!suffix) return `${name}-解压`;
  const baseName = name.slice(0, -suffix.length).trim();
  return baseName || "解压内容";
}
