"use server"

import prisma from "@/lib/prisma"
import { subDays, startOfDay, endOfDay, format } from "date-fns"
import { requireAppAuth } from "@/lib/auth-guard"

export type ApiErrorBreakdown = {
  overloaded: number
  quota: number
  other: number
}

export type ApiStatsResult = {
  dateStr: string
  keyIndex: number
  successCount: number
  errorCount: number
  errorBreakdown: ApiErrorBreakdown
}

export async function getApiStats(): Promise<ApiStatsResult[]> {
  await requireAppAuth()

  try {
    const today = new Date()

    // We want the last 3 days including today
    const startDate = startOfDay(subDays(today, 2))
    const endDate = endOfDay(today)

    const logs = await prisma.apiUsageLog.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        }
      }
    })

    // Aggregate the logs
    // Key format: "YYYY-MM-DD_apiKeyIndex"
    const aggregated = logs.reduce((acc, log) => {
      const dateStr = format(log.createdAt, "dd.MM.")
      const keyIndex = log.apiKeyIndex
      const key = `${dateStr}_${keyIndex}`

      if (!acc[key]) {
        acc[key] = {
          dateStr,
          keyIndex,
          successCount: 0,
          errorCount: 0,
          errorBreakdown: {
            overloaded: 0,
            quota: 0,
            other: 0,
          },
        }
      }

      if (log.isSuccess) {
        acc[key].successCount++
      } else {
        acc[key].errorCount++
        if (log.errorReason === "overloaded") {
          acc[key].errorBreakdown.overloaded++
        } else if (log.errorReason === "quota") {
          acc[key].errorBreakdown.quota++
        } else {
          acc[key].errorBreakdown.other++
        }
      }

      return acc
    }, {} as Record<string, ApiStatsResult>)

    // Let's generate a full structure for all 3 days and known keys to avoid gaps in the chart
    // First, find all unique keys that were used
    const allKeys = Array.from(new Set(logs.map(l => l.apiKeyIndex))).sort((a, b) => a - b)

    // If no keys were used yet, return an empty array
    if (allKeys.length === 0) {
      return []
    }

    const results: ApiStatsResult[] = []

    // Iterate over the last 3 days
    for (let i = 2; i >= 0; i--) {
      const d = subDays(today, i)
      const dateStr = format(d, "dd.MM.")

      // For each day, ensure we have an entry for each key
      for (const keyIndex of allKeys) {
        const key = `${dateStr}_${keyIndex}`
        if (aggregated[key]) {
          results.push(aggregated[key])
        } else {
          results.push({
            dateStr,
            keyIndex,
            successCount: 0,
            errorCount: 0,
            errorBreakdown: {
              overloaded: 0,
              quota: 0,
              other: 0,
            },
          })
        }
      }
    }

    return results
  } catch (error) {
    console.error("Fehler beim Abrufen der API-Statistiken:", error)
    return []
  }
}
