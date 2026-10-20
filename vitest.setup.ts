import '@testing-library/jest-dom'
import { vi } from 'vitest'

declare global {
  var __mockCookies: Map<string, any>
  var __mockHeaders: Map<string, string>
}

if (!globalThis.__mockCookies) {
  globalThis.__mockCookies = new Map()
}
if (!globalThis.__mockHeaders) {
  globalThis.__mockHeaders = new Map()
}

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => globalThis.__mockCookies.get(name),
    set: (name: string, value: string, options?: any) => {
      globalThis.__mockCookies.set(name, { name, value, ...options })
    },
    delete: (name: string) => {
      globalThis.__mockCookies.delete(name)
    },
  }),
  headers: async () => ({
    get: (name: string) => {
      const lower = name.toLowerCase()
      if (globalThis.__mockHeaders.has(lower)) {
        return globalThis.__mockHeaders.get(lower)
      }
      return lower === 'x-forwarded-proto' ? 'https' : null
    },
  }),
}))
