import { NextRequest, NextResponse } from "next/server"
import prisma, { reloadPrismaClient } from "@/lib/prisma"
import { encryptSecret, decryptSecret } from "@/lib/security/crypto"
import { getCurrentUser } from "@/lib/auth-guard"
import { getPublicOrigin, getSafeRedirectUrl } from "@/lib/utils/url"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const error = req.nextUrl.searchParams.get("error")
  const returnTo = req.cookies.get("or_return_to")?.value || "/settings"
  const codeVerifier = req.cookies.get("or_code_verifier")?.value

  const publicOrigin = getPublicOrigin(req)
  const safeReturnTo = getSafeRedirectUrl(returnTo, "/settings")
  const redirectUrl = new URL(safeReturnTo, publicOrigin)

  if (error || !code) {
    redirectUrl.searchParams.set("ai_error", error || "Kein Autorisierungscode von OpenRouter erhalten.")
    return NextResponse.redirect(redirectUrl.toString())
  }

  if (!codeVerifier) {
    redirectUrl.searchParams.set("ai_error", "Sitzungs-Verifier abgelaufen. Bitte erneut versuchen.")
    return NextResponse.redirect(redirectUrl.toString())
  }

  // Restore database connection if container restarted
  if (!process.env.DATABASE_URL) {
    const encryptedDbCookie = req.cookies.get("runtime_db_url")?.value
    if (encryptedDbCookie) {
      try {
        const decrypted = decryptSecret(encryptedDbCookie)
        if (decrypted && (decrypted.startsWith("postgresql://") || decrypted.startsWith("postgres://"))) {
          process.env.DATABASE_URL = decrypted
          reloadPrismaClient(decrypted)
        }
      } catch {
        // ignore
      }
    }
  }

  try {
    const tokenRes = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: "S256",
      }),
    })

    if (!tokenRes.ok) {
      const errText = await tokenRes.text().catch(() => "")
      redirectUrl.searchParams.set(
        "ai_error",
        `Fehler beim Abrufen des Schlüssels von OpenRouter (${tokenRes.status}): ${errText}`
      )
      return NextResponse.redirect(redirectUrl.toString())
    }

    const data = await tokenRes.json()
    const apiKey = data?.key

    if (!apiKey) {
      redirectUrl.searchParams.set("ai_error", "Kein Schlüssel in der OpenRouter-Antwort gefunden.")
      return NextResponse.redirect(redirectUrl.toString())
    }

    const encrypted = encryptSecret(apiKey)

    // Save as global AI key for the whole app
    const existingGlobal = await prisma.userAiCredential.findFirst({
      where: {
        userId: null,
        provider: "openrouter_oauth",
      },
    })

    if (existingGlobal) {
      await prisma.userAiCredential.update({
        where: { id: existingGlobal.id },
        data: {
          apiKey: encrypted,
          accessToken: encrypted,
          tokenType: "Bearer",
        },
      })
    } else {
      await prisma.userAiCredential.create({
        data: {
          userId: null,
          provider: "openrouter_oauth",
          apiKey: encrypted,
          accessToken: encrypted,
          tokenType: "Bearer",
        },
      })
    }

    // Also update settings table to activate OpenRouter
    await prisma.settings.upsert({
      where: { id: "default" },
      update: { activeAiProvider: "openrouter" },
      create: { id: "default", activeAiProvider: "openrouter" },
    })

    redirectUrl.searchParams.set("ai_connected", "openrouter")
    const res = NextResponse.redirect(redirectUrl.toString())

    res.cookies.delete("or_code_verifier")
    res.cookies.delete("or_return_to")

    return res
  } catch (err: any) {
    redirectUrl.searchParams.set("ai_error", err?.message || "Fehler beim Verbinden mit OpenRouter.")
    return NextResponse.redirect(redirectUrl.toString())
  }
}
