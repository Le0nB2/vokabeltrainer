import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { testAndMigrateDatabase, useLocalDatabase } from "@/actions/setup-database"
import fs from "fs"
import path from "path"

const configPath = path.join(process.cwd(), "prisma", "runtime-db.json")

describe("setup-database actions", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath)
      } catch {
        // ignore
      }
    }
  })

  afterEach(() => {
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath)
      } catch {
        // ignore
      }
    }
  })

  it("rejects empty connection strings", async () => {
    const res = await testAndMigrateDatabase("")
    expect(res.success).toBe(false)
    expect(res.error).toContain("Bitte gib einen gültigen Neon Connection String ein")
  })

  it("rejects invalid protocols", async () => {
    const res = await testAndMigrateDatabase("mysql://user:pass@localhost/db")
    expect(res.success).toBe(false)
    expect(res.error).toContain("postgresql://")
  })

  it("activates local database via useLocalDatabase", async () => {
    const res = await useLocalDatabase()
    expect(res.success).toBe(true)
    expect(fs.existsSync(configPath)).toBe(true)
    const content = JSON.parse(fs.readFileSync(configPath, "utf8"))
    expect(content.databaseType).toBe("sqlite")
  })
})
