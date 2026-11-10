import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAdminUser, UnauthorizedError } from '@/lib/auth-guard'
import { checkSettingsAuthenticated } from '@/actions/auth'

async function handleExport() {
  try {
    // 1. Enforce Admin User
    await requireAdminUser()

    // 2. Enforce Settings Auth if configured
    const isAuth = await checkSettingsAuthenticated()
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const settings = await prisma.settings.findUnique({
      where: { id: "default" }
    })
    const safeSettings = settings
      ? (({ settingsPasswordHash: _omitted, ...rest }) => rest)(settings as any)
      : null

    const decks = await prisma.deck.findMany({
      include: {
        user: {
          select: {
            username: true,
            displayName: true,
          },
        },
        cards: {
          include: {
            reviewLogs: true,
          },
        },
        reviewLogs: true,
      },
    })

    const payloadData = {
      version: 2,
      settings: safeSettings,
      decks: decks.map((deck) => {
        const { user, ...deckRest } = deck
        return {
          ...deckRest,
          ownerUsername: user?.username ?? null,
          ownerDisplayName: user?.displayName ?? null,
        }
      }),
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
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.error('Export failed:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    { error: "Method Not Allowed. Verwende POST zum Exportieren." },
    { status: 405, headers: { Allow: "POST" } }
  )
}

export async function POST() {
  return handleExport()
}

