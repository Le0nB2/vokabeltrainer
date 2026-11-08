import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

export function getRuntimeDbUrl(): string | undefined {
  const envUrl = process.env.DATABASE_URL?.trim()
  if (envUrl && envUrl.length > 0 && !envUrl.includes("localhost:5432")) {
    return envUrl
  }
  try {
    const configPath = path.join(process.cwd(), 'prisma', 'runtime-db.json')
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed?.databaseUrl && typeof parsed.databaseUrl === 'string') {
        const url = parsed.databaseUrl.trim()
        process.env.DATABASE_URL = url
        return url
      }
    }
  } catch {
    // Ignore read errors
  }
  return undefined
}

const prismaClientSingleton = () => {
  getRuntimeDbUrl()
  return new PrismaClient()
}

declare const globalThis: {
  prismaGlobal: ReturnType<typeof prismaClientSingleton> | undefined
} & typeof global

const baseClient = prismaClientSingleton()
globalThis.prismaGlobal = baseClient

export const prisma: PrismaClient = new Proxy(baseClient, {
  get(target, prop) {
    const active = globalThis.prismaGlobal || target
    const val = (active as any)[prop]
    return typeof val === 'function' ? val.bind(active) : val
  },
  set(target, prop, value) {
    const active = globalThis.prismaGlobal || target
    ;(active as any)[prop] = value
    return true
  },
})

export function reloadPrismaClient(newDbUrl?: string): PrismaClient {
  if (newDbUrl) {
    process.env.DATABASE_URL = newDbUrl
  }
  try {
    prisma.$disconnect().catch(() => {})
  } catch {
    // ignore
  }
  const nextClient = new PrismaClient()
  globalThis.prismaGlobal = nextClient
  return nextClient
}

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = baseClient
