"use server"
import {
  AUTH_COOKIE_MAX_AGE,
  AUTH_COOKIE_NAME,
  createAppSessionToken,
  getAppAuthCredentials,
  getAppSecret,
  getSessionCookieValue,
  secureCompare,
} from "@/lib/auth-utils"

import { cookies, headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { createHash, timingSafeEqual } from "crypto"

export async function checkPassword(password: string) {
  const envPassword = process.env.SETTINGS_PASSWORD

  if (!envPassword) {
    return { success: true }
  }

  const hashInput = createHash("sha256").update(password).digest()
  const hashEnv = createHash("sha256").update(envPassword).digest()
  const isMatch = timingSafeEqual(hashInput, hashEnv)

  if (isMatch) {
    const headersList = await headers()
    const isHttps = headersList.get("x-forwarded-proto") === "https"
    const cookieStore = await cookies()
    cookieStore.set("settings_auth", getSessionCookieValue(envPassword), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 // 1 day
    })
    revalidatePath("/settings")
    return { success: true }
  }

  // Add slight delay to mitigate high-speed brute-force attacks
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { success: false, error: "Falsches Passwort" }
}

export async function loginApp(credentials: { username?: string; password?: string }) {
  const { user: envUser, password: envPassword, isConfigured } = getAppAuthCredentials()

  if (!isConfigured) {
    return { success: true }
  }

  const username = (credentials.username || "").trim()
  const password = credentials.password || ""

  const isUserValid = envUser ? secureCompare(username, envUser) : true
  const isPasswordValid = envPassword ? secureCompare(password, envPassword) : false

  if (isUserValid && isPasswordValid) {
    const headersList = await headers()
    const isHttps = headersList.get("x-forwarded-proto") === "https"
    const cookieStore = await cookies()
    const secret = getAppSecret(envPassword)
    const token = createAppSessionToken(envUser || username, secret, AUTH_COOKIE_MAX_AGE)

    cookieStore.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      path: "/",
      sameSite: "lax",
      maxAge: AUTH_COOKIE_MAX_AGE,
    })

    return { success: true }
  }

  // Delay to mitigate brute force
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { success: false, error: "Ungültiger Benutzername oder falsches Passwort" }
}

export async function logoutApp() {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
  })
  return { success: true }
}

export async function isAppAuthRequired() {
  const { isConfigured } = getAppAuthCredentials()
  return isConfigured
}

