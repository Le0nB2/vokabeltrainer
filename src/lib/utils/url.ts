/**
 * Sanitizes and validates a redirect URL to prevent Open Redirect vulnerabilities.
 * Ensures the target is a relative path starting with a single '/' and does not allow
 * protocol-relative URLs (e.g., '//evil.com') or backslash tricks (e.g., '/\\evil.com').
 */
export function getSafeRedirectUrl(target: string | null | undefined, fallback = "/"): string {
  if (!target || typeof target !== "string") return fallback;
  const trimmed = target.trim();

  // Reject control characters, newlines, and null bytes
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return fallback;
  }

  // Must start with '/' and not followed by another '/' or '\'
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }

  // Prevent URL-encoded bypasses (%2f = '/', %5c = '\', %00 = null)
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return fallback;
  }

  if (
    !decoded.startsWith("/") ||
    decoded.startsWith("//") ||
    decoded.startsWith("/\\") ||
    /[\u0000-\u001F\u007F]/.test(decoded)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed, "http://localhost");
    // Ensure origin remains the dummy local origin (no host injection)
    if (parsed.origin !== "http://localhost") {
      return fallback;
    }
    const path = parsed.pathname + parsed.search + parsed.hash;
    return path;
  } catch {
    return fallback;
  }
}

/**
 * Determines the public origin (protocol + host) of the application, taking reverse proxy
 * headers (X-Forwarded-Host, X-Forwarded-Proto) and cloud deployment environment variables
 * (such as RENDER_EXTERNAL_URL) into account. Avoids using internal Docker socket addresses like 0.0.0.0.
 */
export function getPublicOrigin(
  req?: { headers?: { get(name: string): string | null }; url?: string } | null
): string {
  // 1. Explicit Render External URL environment variable
  const renderExternal = process.env.RENDER_EXTERNAL_URL?.trim()
  if (renderExternal) {
    return renderExternal.replace(/\/+$/, "")
  }

  // 2. Standard reverse-proxy headers
  const forwardedHost = req?.headers?.get("x-forwarded-host")
  const host = (forwardedHost?.split(",")[0]?.trim() || req?.headers?.get("host") || "").trim()
  const forwardedProto = req?.headers?.get("x-forwarded-proto")?.split(",")[0]?.trim()

  if (host && !host.startsWith("0.0.0.0") && !host.includes("0.0.0.0")) {
    const proto =
      forwardedProto ||
      (host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https")
    return `${proto}://${host}`
  }

  // 3. Fallback from req.url if valid and not 0.0.0.0
  if (req?.url) {
    try {
      const parsed = new URL(req.url)
      if (parsed.origin && !parsed.origin.includes("0.0.0.0")) {
        return parsed.origin
      }
    } catch {
      // ignore
    }
  }

  // 4. Default fallback
  return "http://localhost:3000"
}
