/**
 * Central settings module.
 *
 * All environment-specific addresses live here.
 * To move the whole app to a different backend, change VITE_API_URL
 * (and optionally VITE_SOCKET_URL) in .env — nothing else needs to change.
 */

function requireEnv(key: string): string {
  const value = import.meta.env[key]
  if (!value) {
    throw new Error(
      `Missing required environment variable "${key}". ` +
        `Check your .env file (see .env.example for reference).`,
    )
  }
  return value
}

/** Base URL for all REST API calls — never add a trailing slash. */
export const API_URL: string = requireEnv('VITE_API_URL')

/** Base URL passed to Socket.IO — usually the same as API_URL. */
export const SOCKET_URL: string = requireEnv('VITE_SOCKET_URL')
