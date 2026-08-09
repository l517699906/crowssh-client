const DEFAULT_API_BASE_URL = "http://154.8.163.87";

function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_CROWSSH_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  const url = new URL(configured);

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("CrowSSH API 地址不能包含凭据、查询参数或片段");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("CrowSSH API 地址只能配置源站，不能包含路径");
  }
  if (import.meta.env.PROD && url.protocol !== "https:") {
    throw new Error("CrowSSH 生产构建只允许使用 HTTPS API 地址");
  }

  return url.origin;
}

/** CrowSSH 服务端基础地址，生产构建强制使用 HTTPS。 */
export const API_BASE_URL = resolveApiBaseUrl();

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
