"use server"

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
    cookieStore.set("settings_auth", "true", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && isHttps,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 // 1 day
    })
    revalidatePath("/settings")
    return { success: true }
  }

  return { success: false, error: "Falsches Passwort" }
}
