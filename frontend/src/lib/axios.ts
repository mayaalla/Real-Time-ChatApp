/**
 * Configured axios instance.
 *
 * Responsibilities:
 *  - Attach the access token to every outgoing request.
 *  - On 401 "token expired", call /auth/refresh once, then retry the
 *    original request transparently.  Concurrent failures share a single
 *    refresh promise so the endpoint is never hit more than once at a time.
 *  - On a failed refresh, clear credentials and redirect to /login.
 */

import axios, {
  AxiosError,
  type InternalAxiosRequestConfig,
} from 'axios'
import { API_URL } from '@/config/settings'

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send the httpOnly refresh cookie on every request
  headers: { 'Content-Type': 'application/json' },
})

// ---------------------------------------------------------------------------
// Token helpers
// These are intentionally thin so that any Zustand / context auth store can
// call setAccessToken / clearAccessToken without this file importing the store
// (which would create a circular dependency).
// ---------------------------------------------------------------------------

let _accessToken: string | null = null

/** Called by the auth store after login / refresh succeeds. */
export function setAccessToken(token: string | null): void {
  _accessToken = token
}

/** Returns the current in-memory access token. */
export function getAccessToken(): string | null {
  return _accessToken
}

// ---------------------------------------------------------------------------
// Outgoing interceptor — attach Bearer token
// ---------------------------------------------------------------------------

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`
  }
  return config
})

// ---------------------------------------------------------------------------
// Refresh machinery — one promise shared across concurrent 401s
// ---------------------------------------------------------------------------

let refreshPromise: Promise<string> | null = null

async function refreshAccessToken(): Promise<string> {
  // POST /auth/refresh — the httpOnly cookie is sent automatically because
  // withCredentials is true on the instance.
  const response = await api.post<{ accessToken: string }>('/auth/refresh')
  return response.data.accessToken
}

/**
 * Logs the user out and redirects to /login.
 * Imported lazily to avoid circular deps with any auth store.
 */
function forceLogout(): void {
  _accessToken = null
  // Use window.location so we don't need to import the router here.
  window.location.href = '/login'
}

// ---------------------------------------------------------------------------
// Incoming interceptor — silent token refresh on 401
// ---------------------------------------------------------------------------

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retried?: boolean
    }

    const isUnauthorised = error.response?.status === 401
    const alreadyRetried = originalRequest._retried === true
    // Don't attempt a refresh if the failing request IS the refresh endpoint
    // (prevents an infinite refresh loop).
    const isRefreshEndpoint = originalRequest.url?.includes('/auth/refresh')

    if (isUnauthorised && !alreadyRetried && !isRefreshEndpoint) {
      originalRequest._retried = true

      try {
        // Reuse an in-flight refresh promise so N concurrent 401s only fire
        // one network request.
        if (!refreshPromise) {
          refreshPromise = refreshAccessToken().finally(() => {
            refreshPromise = null
          })
        }

        const newToken = await refreshPromise
        setAccessToken(newToken)

        // Patch the original request and retry it with the new token.
        originalRequest.headers.Authorization = `Bearer ${newToken}`
        return api(originalRequest)
      } catch {
        // Refresh itself failed — credentials are gone; kick the user out.
        forceLogout()
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  },
)
