🔒 Fix insecure session management by using HMAC

🎯 **What:** The application previously set a boolean `true` cookie without any signature, MAC, or session ID for authentication (`cookieStore.set("settings_auth", "true", ...)`), making it easily bypassable.
⚠️ **Risk:** Any user could spoof the `settings_auth` cookie with the value `"true"` to gain unauthorized access to the application settings.
🛡️ **Solution:** Introduced an HMAC-based session token in `src/lib/auth-utils.ts` to securely generate and verify the cookie value using the `SETTINGS_PASSWORD` environment variable as the HMAC key.
