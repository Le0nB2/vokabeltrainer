import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAppAuth, UnauthorizedError } from '@/lib/auth-guard'
import { extractTokenFromRequest, verifyNotificationToken } from '@/lib/auth-utils'

export async function GET(req: NextRequest) {
  try {
    // 1. Check for valid Home Assistant / Notification API Token
    const token = extractTokenFromRequest(req.headers, req.nextUrl?.searchParams)
    const isTokenValid = verifyNotificationToken(token)

    // 2. If token is not valid, require App Session Auth (bypassed if auth is not configured)
    if (!isTokenValid) {
      try {
        await requireAppAuth()
      } catch (error) {
        if (error instanceof UnauthorizedError) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        throw error
      }
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" }
    })

    const notificationsEnabled = settings?.notificationsEnabled

    // If notifications are disabled or settings don't exist, return 0
    if (!settings || !notificationsEnabled) {
      return NextResponse.json({ dueCount: 0 }, { status: 200 })
    }

    const now = new Date()

    const dueCount = await prisma.card.count({
      where: {
        dueDate: {
          lte: now
        }
      }
    })

    return NextResponse.json({ dueCount }, { status: 200 })
  } catch (error) {
    console.error('Failed to get due count:', error)
    return NextResponse.json({ error: 'Internal Server Error', dueCount: 0 }, { status: 500 })
  }
}
