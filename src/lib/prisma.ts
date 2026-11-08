import { PrismaClient } from '@prisma/client'
import fs from 'fs'
import path from 'path'

export function getRuntimeDbUrl(): string | undefined {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL.trim()
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

export const prisma = globalThis.prismaGlobal ?? prismaClientSingleton()

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

if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobal = prisma
