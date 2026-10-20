import { describe, it, expect } from 'vitest'
import nextConfig from '../next.config'

describe('SEC-08: HTTP Security Headers in next.config.ts', () => {
  it('disables X-Powered-By header via poweredByHeader: false', () => {
    expect(nextConfig.poweredByHeader).toBe(false)
  })

  it('defines comprehensive security headers for all routes (/(.*))', async () => {
    expect(nextConfig.headers).toBeDefined()
    const headerRules = await nextConfig.headers!()
    expect(headerRules).toBeDefined()
    expect(headerRules.length).toBeGreaterThan(0)

    const catchAllRule = headerRules.find((rule) => rule.source === '/(.*)')
    expect(catchAllRule).toBeDefined()

    const headersMap = new Map(
      catchAllRule!.headers.map((h) => [h.key.toLowerCase(), h.value])
    )

    // 1. Content-Security-Policy
    expect(headersMap.has('content-security-policy')).toBe(true)
    const csp = headersMap.get('content-security-policy')!
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("img-src 'self' blob: data:")
    expect(csp).toContain("connect-src 'self'")
    // Must NOT contain upgrade-insecure-requests to maintain local HTTP compatibility
    expect(csp).not.toContain('upgrade-insecure-requests')

    // 2. Strict-Transport-Security (HSTS)
    expect(headersMap.has('strict-transport-security')).toBe(true)
    const hsts = headersMap.get('strict-transport-security')!
    expect(hsts).toContain('max-age=63072000')
    expect(hsts).toContain('includeSubDomains')
    expect(hsts).toContain('preload')

    // 3. X-Content-Type-Options
    expect(headersMap.get('x-content-type-options')).toBe('nosniff')

    // 4. X-Frame-Options
    expect(headersMap.get('x-frame-options')).toBe('DENY')

    // 5. Referrer-Policy
    expect(headersMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin')

    // 6. Permissions-Policy
    expect(headersMap.has('permissions-policy')).toBe(true)
    const permissions = headersMap.get('permissions-policy')!
    expect(permissions).toContain('camera=(self)')
    expect(permissions).toContain('microphone=()')
    expect(permissions).toContain('geolocation=()')
    expect(permissions).toContain('browsing-topics=()')

    // 7. X-DNS-Prefetch-Control
    expect(headersMap.get('x-dns-prefetch-control')).toBe('on')
  })
})
