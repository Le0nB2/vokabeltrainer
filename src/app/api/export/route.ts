import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAppAuth, UnauthorizedError } from '@/lib/auth-guard'
import { checkSettingsAuthenticated } from '@/actions/auth'

async function handleExport() {
  try {
    // 1. Enforce App Auth (bypassed if not configured in environment)
    await requireAppAuth()

    // 2. Enforce Settings Auth if configured
    const isAuth = await checkSettingsAuthenticated()
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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

