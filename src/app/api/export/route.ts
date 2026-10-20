import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { verifySettingsSessionToken, SETTINGS_COOKIE_NAME } from '@/lib/auth-utils'

export async function GET() {
  try {
    const envPassword = process.env.SETTINGS_PASSWORD
    if (envPassword) {
      const cookieStore = await cookies()
      const isAuthenticated = verifySettingsSessionToken(
        cookieStore.get(SETTINGS_COOKIE_NAME)?.value,
        envPassword
      )
      if (!isAuthenticated) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" }
    })

    const decks = await prisma.deck.findMany({
      include: {
        cards: {
            include: {
                reviewLogs: true
            }
        },
        reviewLogs: true,
      },
    })

    const payloadData = {
      version: 2,
      settings: settings,
      decks: decks
    }

    const payload = JSON.stringify(payloadData, null, 2)

    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="vokabeltrainer_export.json"',
      },
    })
  } catch (error) {
    console.error('Export failed:', error)
    return new NextResponse('Export failed', { status: 500 })
  }
}
