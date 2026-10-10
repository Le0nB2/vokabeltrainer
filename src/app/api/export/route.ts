import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET() {
  try {
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
