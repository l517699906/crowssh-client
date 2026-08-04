/** CrowSSH 服务端基础地址（Nginx 80 端口） */
export const API_BASE_URL = "http://154.8.163.87";

export function buildRequestUrl(
  path: string,
  params?: Record<string, string>,
): string {
  const url = new URL(`${API_BASE_URL}${path}`);
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}
