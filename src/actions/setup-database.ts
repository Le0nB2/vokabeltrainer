"use server"

import fs from "fs"
import path from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { PrismaClient } from "@prisma/client"
import { reloadPrismaClient } from "@/lib/prisma"

const execAsync = promisify(exec)

export interface DatabaseSetupResult {
  success: boolean
  error?: string
  message?: string
}

const CONFIG_PATH = path.join(process.cwd(), "prisma", "runtime-db.json")

export async function testAndMigrateDatabase(connectionString: string): Promise<DatabaseSetupResult> {
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

  // 1. Connection test with Prisma
  let testClient: PrismaClient | null = null
  try {
    testClient = new PrismaClient({
      datasources: {
        db: { url: cleanUrl },
      },
    })
    await testClient.$queryRaw`SELECT 1;`
  } catch (err: any) {
    return {
      success: false,
      error: `Verbindung zur Neon-Datenbank fehlgeschlagen: ${err?.message || "Unbekannter Fehler"}`,
    }
  } finally {
    if (testClient) {
      await testClient.$disconnect().catch(() => {})
    }
  }

  // 2. Run migrations
  try {
    const directUrl = cleanUrl.replace("-pooler.", ".")
    const schemaFile = fs.existsSync(path.join(process.cwd(), "prisma", "postgres", "schema.prisma"))
      ? "prisma/postgres/schema.prisma"
      : "prisma/schema.prisma"

    await execAsync(`npx prisma migrate deploy --schema=${schemaFile}`, {
      env: {
        ...process.env,
        DATABASE_URL: cleanUrl,
        DIRECT_URL: directUrl,
      },
      timeout: 60000,
    })
  } catch (err: any) {
    return {
      success: false,
      error: `Fehler beim Ausführen der Datenbank-Migrationen: ${err?.message || "Fehler beim Schema-Update"}`,
    }
  }

  // 3. Save runtime configuration
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

  // 4. Reload prisma client
  reloadPrismaClient(cleanUrl)

  return {
    success: true,
    message: "Neon-Datenbank erfolgreich verbunden und initialisiert!",
  }
}

export async function useLocalDatabase(): Promise<DatabaseSetupResult> {
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
    return { success: false, error: err?.message || "Fehler beim Aktivieren der lokalen Datenbank." }
  }
}
