import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
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
