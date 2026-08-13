/**
 * HTTP 请求客户端
 * 封装 fetch，统一处理响应格式和错误
 * 所有环境固定直连部署服务端
 */

import { fetchWithDeviceAuthorization, withDeviceAuthorization } from './deviceIdentity'
import { buildRequestUrl } from './config'

export { API_BASE_URL, buildRequestUrl } from './config'

/** 后端统一响应结构 */
export interface ApiResponse<T = unknown> {
    code: string
    info: string
    data: T | null
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
    timeoutMs = TIMEOUT_MS,
    signal?: AbortSignal,
): Promise<ApiResponse<T>> {
    // 拼接 query string
    const url = buildRequestUrl(path, params)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const abortFromCaller = () => controller.abort()
    signal?.addEventListener('abort', abortFromCaller, { once: true })
    if (signal?.aborted) controller.abort()

    try {
        const headers = await withDeviceAuthorization(
            body ? { 'Content-Type': 'application/json' } : undefined,
        )
        const res = await fetch(url, {
            method,
            headers,
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
        signal?.removeEventListener('abort', abortFromCaller)
    }
}

/** GET 请求 */
export function get<T>(path: string, params?: Record<string, string>) {
    return request<T>('GET', path, undefined, params)
}

/** GET 请求，允许短轮询接口指定独立超时。 */
export function getWithTimeout<T>(
    path: string,
    params: Record<string, string>,
    timeoutMs: number,
    signal?: AbortSignal,
) {
    return request<T>('GET', path, undefined, params, timeoutMs, signal)
}

/** POST 请求（JSON body + 可选 query params） */
export function post<T>(path: string, body?: unknown, params?: Record<string, string>) {
    return request<T>('POST', path, body, params)
}

/** POST 请求，允许调用方为长耗时操作指定独立超时。 */
export function postWithTimeout<T>(path: string, body: unknown, timeoutMs: number) {
    return request<T>('POST', path, body, undefined, timeoutMs)
}

/** 发起不设短超时的流式 POST 请求，由调用方负责读取响应体和取消请求。 */
export async function postStream(path: string, body: unknown, signal?: AbortSignal) {
    const res = await fetchWithDeviceAuthorization(buildRequestUrl(path), {
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

/** DELETE 请求，允许递归删除等长耗时操作使用独立超时。 */
export function delWithTimeout<T>(
    path: string,
    params: Record<string, string>,
    timeoutMs: number,
) {
    return request<T>('DELETE', path, undefined, params, timeoutMs)
}
