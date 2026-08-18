export const MAX_UPLOAD_FILE_SIZE_BYTES = 1024 * 1024 * 1024;
export const UPLOAD_FILE_TOO_LARGE_MESSAGE = "上传失败：文件大小超过 1 GB 限制";

export function assertUploadFileSize(fileSize: number): void {
  if (fileSize > MAX_UPLOAD_FILE_SIZE_BYTES) {
    throw new Error(UPLOAD_FILE_TOO_LARGE_MESSAGE);
  }
}

export function uploadHttpErrorMessage(status: number, fallback: string): string {
  return status === 413 ? UPLOAD_FILE_TOO_LARGE_MESSAGE : fallback;
}
