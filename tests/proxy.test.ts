import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { proxy } from '../src/proxy'
import { NextRequest } from 'next/server'

// Mock next/server response methods
vi.mock('next/server', () => {
  return {
    NextResponse: class {
      body: string
      status: number
      headers: Map<string, string>

      constructor(body: string, init: any) {
        this.body = body
        this.status = init?.status
        this.headers = new Map(Object.entries(init?.headers || {}))
      }

      static next() {
        return { status: 200, type: 'next' }
      }
    }
  }
})

describe('proxy middleware basic auth', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.BASIC_AUTH_USER = 'testuser'
    process.env.BASIC_AUTH_PASSWORD = 'testpassword:with:colons'
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function createMockRequest(authHeader?: string | null): NextRequest {
    return {
      headers: {
        get: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader : null),
      },
    } as unknown as NextRequest
  }

  it('should bypass auth if env vars are missing', () => {
    delete process.env.BASIC_AUTH_USER
    const req = createMockRequest(null)
    const result = proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  it('should return 401 if auth header is missing', () => {
    const req = createMockRequest(null)
    const result: any = proxy(req)
    expect(result.status).toBe(401)
    expect(result.headers.get('WWW-Authenticate')).toBe('Basic realm="Secure Area"')
  })

  it('should allow valid credentials', () => {
    const authHeader = `Basic ${btoa('testuser:testpassword:with:colons')}`
    const req = createMockRequest(authHeader)
    const result = proxy(req)
    expect(result).toEqual({ status: 200, type: 'next' })
  })

  it('should return 401 for invalid credentials', () => {
    const authHeader = `Basic ${btoa('testuser:wrongpassword')}`
    const req = createMockRequest(authHeader)
    const result: any = proxy(req)
    expect(result.status).toBe(401)
  })

  it('should return 401 for malformed base64', () => {
    const authHeader = `Basic invalid_base64_string!!!!`
    const req = createMockRequest(authHeader)
    const result: any = proxy(req)
    expect(result.status).toBe(401)
  })

  it('should return 401 for valid base64 but missing colon', () => {
    const authHeader = `Basic ${btoa('testuserpassword')}`
    const req = createMockRequest(authHeader)
    const result: any = proxy(req)
    expect(result.status).toBe(401)
  })
})
