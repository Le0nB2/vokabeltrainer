"use server"

import fs from "fs"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import { cookies, headers } from "next/headers"
import { PrismaClient } from "@prisma/client"
import { reloadPrismaClient } from "@/lib/prisma"
import { encryptSecret } from "@/lib/security/crypto"
import { isSecureRequest } from "@/lib/auth-utils"
import { getSetupState } from "@/actions/setup"
import { getCurrentUser } from "@/lib/auth-guard"
import { checkSettingsAuthenticated } from "@/actions/auth"

const execFileAsync = promisify(execFile)

export interface DatabaseSetupResult {
  success: boolean
  error?: string
  message?: string
}

const CONFIG_PATH = path.join(process.cwd(), "prisma", "runtime-db.json")

async function assertDatabaseSetupAllowed(): Promise<void> {
  const setupState = await getSetupState()
  if (setupState.needsSetup) return

  const user = await getCurrentUser()
  const isSettingsAuth = await checkSettingsAuthenticated()
  if (!user || user.role !== "ADMIN" || !isSettingsAuth) {
    throw new Error("Nicht autorisiert: Datenbank-Konfiguration ist gesperrt.")
  }
}

export async function testAndMigrateDatabase(connectionString: string): Promise<DatabaseSetupResult> {
  try {
    await assertDatabaseSetupAllowed()
  } catch (authErr: any) {
    return { success: false, error: authErr.message }
  }

  const cleanUrl = connectionString?.trim()
  if (!cleanUrl) {
    return { success: false, error: "Bitte gib einen gültigen Neon Connection String ein." }
  }

  if (!cleanUrl.startsWith("postgres://") && !cleanUrl.startsWith("postgresql://")) {
    return {
      success: false,
      error: "Ungültiges Format. Der Connection String muss mit 'postgresql://' oder 'postgres://' beginnen.",
    }
  }

  // 1. Connection test and migration via Prisma CLI
  try {
    const directUrl = cleanUrl.replace("-pooler.", ".")
    const schemaFile = fs.existsSync(path.join(process.cwd(), "prisma", "postgres", "schema.prisma"))
      ? "prisma/postgres/schema.prisma"
      : "prisma/schema.prisma"

    // Ensure cache dir exists for engine downloads
    const enginesDir = "/tmp/prisma-engines"
    if (!fs.existsSync(enginesDir)) {
      try {
        fs.mkdirSync(enginesDir, { recursive: true })
      } catch {
        // ignore
      }
    }

    const execEnv = {
      ...process.env,
      PRISMA_ENGINES_CACHE_DIR: enginesDir,
      DATABASE_URL: cleanUrl,
      DIRECT_URL: directUrl,
    }

    await execFileAsync("npx", ["prisma", "migrate", "deploy", `--schema=${schemaFile}`], {
      env: execEnv,
      timeout: 60000,
    })

    if (schemaFile.includes("postgres")) {
      try {
        await execFileAsync("npx", ["prisma", "generate", `--schema=${schemaFile}`], {
          env: execEnv,
          timeout: 60000,
        })
      } catch (genErr: any) {
        console.warn("prisma generate notice (client might already be generated):", genErr?.message)
      }
    }
  } catch (err: any) {
    console.error("Database migration error:", err)
    return {
      success: false,
      error: "Verbindung zur Neon-Datenbank oder Migration fehlgeschlagen. Bitte prüfe die Verbindungsdaten.",
    }
  }

  // 2. Save runtime configuration
  try {
    const configDir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          databaseType: "postgres",
          databaseUrl: cleanUrl,
          configuredAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    )
  } catch (err: any) {
    console.error("Failed to write runtime-db.json:", err)
  }

  // 3. Reload prisma client
  reloadPrismaClient(cleanUrl)

  // 4. Save encrypted database URL in persistent cookie
  try {
    const cookieStore = await cookies()
    const headersList = await headers()
    const isSecure = isSecureRequest(headersList)
    cookieStore.set("runtime_db_url", encryptSecret(cleanUrl), {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 365 * 24 * 60 * 60, // 1 year
    })
  } catch (cookieErr) {
    console.warn("Could not set runtime_db_url cookie:", cookieErr)
  }

  return {
    success: true,
    message: "Neon-Datenbank erfolgreich verbunden und initialisiert!",
  }
}

export async function useLocalDatabase(): Promise<DatabaseSetupResult> {
  try {
    await assertDatabaseSetupAllowed()
  } catch (authErr: any) {
    return { success: false, error: authErr.message }
  }

  try {
    const configDir = path.dirname(CONFIG_PATH)
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    fs.writeFileSync(
      CONFIG_PATH,
      JSON.stringify(
        {
          databaseType: "sqlite",
          configuredAt: new Date().toISOString(),
        },
        null,
        2
      ),
      "utf8"
    )

    reloadPrismaClient()
    return { success: true, message: "Lokale SQLite-Datenbank aktiviert." }
  } catch (err: any) {
    console.error("Local database activation error:", err)
    return { success: false, error: "Fehler beim Aktivieren der lokalen Datenbank." }
  }
}
