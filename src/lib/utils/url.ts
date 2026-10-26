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
