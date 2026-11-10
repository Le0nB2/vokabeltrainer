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

  it("blocks reconfiguration when setup is completed and caller is unauthorized (CRIT-01)", async () => {
    const setupActions = await import("@/actions/setup")
    const authGuard = await import("@/lib/auth-guard")
    vi.spyOn(setupActions, "getSetupState").mockResolvedValue({
      needsSetup: false,
      isPublicOrRender: false,
      isRender: false,
      databaseNeedsSetup: false,
    })
    vi.spyOn(authGuard, "getCurrentUser").mockResolvedValue({
      id: "child-user",
      username: "child",
      role: "USER",
    })

    const res = await testAndMigrateDatabase("postgresql://user:pass@ep-cool.neon.tech/db")
    expect(res.success).toBe(false)
    expect(res.error).toContain("Nicht autorisiert")

    const resLocal = await useLocalDatabase()
    expect(resLocal.success).toBe(false)
    expect(resLocal.error).toContain("Nicht autorisiert")
  })
})
