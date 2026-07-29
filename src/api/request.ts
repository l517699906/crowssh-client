/**
 * HTTP 请求客户端
 * 封装 fetch，统一处理响应格式和错误
 *
 * 默认行为（dev 模式）：baseUrl = ''，走 Vite proxy
 * 用户在设置中修改服务端地址后：直接使用用户指定的地址，绕过 proxy
 * 生产模式（Tauri）：直连用户配置的地址
 */

import { load, remove, save } from "../lib/storage";

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
    code: string
    info: string
    data: T | null
}

/** 默认服务端地址 */
export const DEFAULT_SERVER_URL = "http://localhost:8091";
const SERVER_URL_KEY = "settings.server-url.v1";
const LEGACY_SERVER_URL_KEY = "walissh_server_url";

function readSavedServerUrl(): string {
    const saved = load<string>(SERVER_URL_KEY, "").trim();
    if (saved) return saved;

    try {
        const legacy = localStorage.getItem(LEGACY_SERVER_URL_KEY)?.trim() ?? "";
        if (legacy) {
            save(SERVER_URL_KEY, legacy);
            localStorage.removeItem(LEGACY_SERVER_URL_KEY);
        }
        return legacy;
    } catch {
        return "";
    }
}

function toRequestBaseUrl(url: string): string {
    return import.meta.env.DEV && (!url || url === DEFAULT_SERVER_URL) ? "" : url;
}

/**
 * 服务端基础地址
 * - dev 模式默认空字符串（走 Vite proxy）
 * - 用户显式设置后覆盖为实际地址（直连）
 * - 生产模式从 localStorage 读取
 */
let baseUrl = toRequestBaseUrl(readSavedServerUrl() || DEFAULT_SERVER_URL);

export function buildRequestUrl(
    path: string,
    params?: Record<string, string>,
): string {
    const url = new URL(`${baseUrl}${path}`, window.location.origin)
    Object.entries(params ?? {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, value)
        }
    })
    return baseUrl ? url.toString() : `${url.pathname}${url.search}`
}

/** 获取当前服务端地址（显示用，空字符串时返回默认值） */
export function getBaseUrl(): string {
    return baseUrl || DEFAULT_SERVER_URL;
}

/** 校验并标准化服务端基础地址，空值表示恢复默认地址。 */
export function normalizeServerUrl(url: string): string {
    const trimmed = url.trim().replace(/\/+$/, "");
    if (!trimmed) return DEFAULT_SERVER_URL;

    let parsed: URL;
    try {
        parsed = new URL(trimmed);
    } catch {
        throw new Error("服务端地址必须是完整的 HTTP 或 HTTPS 地址");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("服务端地址只支持 HTTP 或 HTTPS");
    }
    return parsed.href.replace(/\/+$/, "");
}

/**
 * 设置服务端地址（持久化到 localStorage）
 *
 * dev 模式下：
 * - 传入空或默认地址 → baseUrl = ''（走 Vite proxy）
 * - 传入其他地址 → baseUrl = 该地址（直连，绕过 proxy）
 *
 * 这样用户在设置页修改的地址才能真正生效
 */
export function setBaseUrl(url: string): string {
    const normalized = normalizeServerUrl(url);
    baseUrl = toRequestBaseUrl(normalized);
    if (normalized === DEFAULT_SERVER_URL) {
        remove(SERVER_URL_KEY);
    } else {
        save(SERVER_URL_KEY, normalized);
    }
    return normalized;
}

/** 请求超时（毫秒） */
const TIMEOUT_MS = 15000

/**
 * 通用请求方法
 */
async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
): Promise<ApiResponse<T>> {
    // 拼接 query string
    const url = buildRequestUrl(path, params)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const res = await fetch(url, {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : undefined,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        })

        if (!res.ok) {
            return { code: String(res.status), info: res.statusText, data: null }
        }

        return (await res.json()) as ApiResponse<T>
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            return { code: 'TIMEOUT', info: '请求超时', data: null }
        }
        return { code: 'NETWORK_ERROR', info: err?.message || '网络错误', data: null }
    } finally {
        clearTimeout(timer)
    }
}

/** GET 请求 */
export function get<T>(path: string, params?: Record<string, string>) {
    return request<T>('GET', path, undefined, params)
}

/** POST 请求（JSON body + 可选 query params） */
export function post<T>(path: string, body?: unknown, params?: Record<string, string>) {
    return request<T>('POST', path, body, params)
}

/** 发起不设短超时的流式 POST 请求，由调用方负责读取响应体和取消请求。 */
export async function postStream(path: string, body: unknown, signal?: AbortSignal) {
    const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
    })

    if (!res.ok) {
        throw new Error(res.statusText || `请求失败 (${res.status})`)
    }
    if (!res.body) {
        throw new Error('服务端未返回流式响应')
    }

    return res
}

/** PUT 请求 */
export function put<T>(path: string, body?: unknown, params?: Record<string, string>) {
    return request<T>('PUT', path, body, params)
}

/** DELETE 请求 */
export function del<T>(path: string, params?: Record<string, string>) {
    return request<T>('DELETE', path, undefined, params)
}
