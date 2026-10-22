"use client"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import ChartDataLabels from 'chartjs-plugin-datalabels'
import type { ApiStatsResult } from '@/actions/api-stats'

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

export function ApiUsageChart({
  data,
  embedded = false,
}: {
  data: ApiStatsResult[]
  embedded?: boolean
}) {
  if (!data || data.length === 0) {
    if (embedded) {
      return (
        <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Noch keine API-Aufrufe aufgezeichnet.
        </div>
      )
    }
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm mb-8 flex flex-col items-center justify-center min-h-[250px]">
        <p className="text-zinc-500 dark:text-zinc-400 text-sm">
          Noch keine API-Aufrufe aufgezeichnet.
        </p>
      </div>
    )
  }

  // Extract unique dates for X-axis
  const uniqueDates = Array.from(new Set(data.map(d => d.dateStr)))
  // Extract unique API keys
  const uniqueKeys = Array.from(new Set(data.map(d => d.keyIndex))).sort((a, b) => a - b)

  const datasets = []

  // Blue tone gradations for successful attempts, red tone gradations for errors
  const colorPalettes = [
    { success: 'rgba(37, 99, 235, 0.85)', error: 'rgba(220, 38, 38, 0.85)' }, // Key 1: Royal Blue / Vivid Red
    { success: 'rgba(14, 165, 233, 0.85)', error: 'rgba(244, 63, 94, 0.85)' }, // Key 2: Sky Blue / Coral Red
    { success: 'rgba(30, 58, 138, 0.85)', error: 'rgba(153, 27, 27, 0.85)' }, // Key 3: Navy Blue / Dark Wine Red
    { success: 'rgba(99, 102, 241, 0.85)', error: 'rgba(225, 29, 72, 0.85)' }, // Key 4: Indigo Blue / Rose Red
    { success: 'rgba(2, 132, 199, 0.85)', error: 'rgba(185, 28, 28, 0.85)' },  // Key 5: Cerulean Blue / Crimson Red
    { success: 'rgba(14, 116, 144, 0.85)', error: 'rgba(159, 18, 57, 0.85)' }, // Key 6: Deep Cyan / Burgundy Red
  ]

  for (let i = 0; i < uniqueKeys.length; i++) {
    const key = uniqueKeys[i]
    // Wir nutzen den stack-Parameter, um die Balken pro Key zu stapeln
    const stackName = `StackKey${key}`
    const colors = colorPalettes[i % colorPalettes.length]

    // Dataset für erfolgreiche Aufrufe dieses Keys
    datasets.push({
      label: `API ${key} (Erfolg)`,
      keyIndex: key,
      isError: false,
      data: uniqueDates.map(date => {
        const item = data.find(d => d.dateStr === date && d.keyIndex === key)
        return item ? item.successCount : 0
      }),
      backgroundColor: colors.success,
      stack: stackName,
    })

    // Dataset für fehlerhafte Aufrufe dieses Keys
    datasets.push({
      label: `API ${key} (Fehler)`,
      keyIndex: key,
      isError: true,
      data: uniqueDates.map(date => {
        const item = data.find(d => d.dateStr === date && d.keyIndex === key)
        return item ? item.errorCount : 0
      }),
      backgroundColor: colors.error,
      stack: stackName,
    })
  }

  const chartData = {
    labels: uniqueDates,
    datasets: datasets,
  }

  // Calculate totals for error breakdown badges
  const totalOverloaded = data.reduce((sum, d) => sum + (d.errorBreakdown?.overloaded || 0), 0)
  const totalQuota = data.reduce((sum, d) => sum + (d.errorBreakdown?.quota || 0), 0)
  const totalOther = data.reduce((sum, d) => sum + (d.errorBreakdown?.other || 0), 0)
  const totalErrors = totalOverloaded + totalQuota + totalOther

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: '#71717a', // zinc-500
          usePointStyle: true,
          padding: 20
        }
      },
      title: {
        display: false,
      },
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          label: function(context: any) {
            const dataset = context.dataset
            const val = context.raw || 0
            if (!dataset.isError || val === 0) {
              return ` ${dataset.label}: ${val}`
            }

            const date = uniqueDates[context.dataIndex]
            const item = data.find(d => d.dateStr === date && d.keyIndex === dataset.keyIndex)
            if (!item || !item.errorBreakdown) {
              return ` ${dataset.label}: ${val}`
            }

            const { overloaded, quota, other } = item.errorBreakdown
            const reasons: string[] = []
            if (overloaded > 0) reasons.push(`${overloaded}x überlastet (503)`)
            if (quota > 0) reasons.push(`${quota}x Quote erschöpft (429)`)
            if (other > 0) reasons.push(`${other}x Sonstiger Fehler`)

            const detailStr = reasons.length > 0 ? ` [${reasons.join(', ')}]` : ''
            return ` ${dataset.label}: ${val}${detailStr}`
          }
        }
      },
      datalabels: {
        color: 'white',
        font: {
          weight: 'bold' as const,
          size: 11,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        display: function(context: { dataset: any, dataIndex: number }) {
          // Nur anzeigen, wenn der Wert > 0 ist
          return context.dataset.data[context.dataIndex] > 0;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: function(value: number, context: { dataset: any, dataIndex: number }) {
          const dataset = context.dataset
          if (!dataset.isError || value === 0) {
            return Math.round(value)
          }

          const date = uniqueDates[context.dataIndex]
          const item = data.find(d => d.dateStr === date && d.keyIndex === dataset.keyIndex)
          if (!item || !item.errorBreakdown) {
            return Math.round(value)
          }

          const { overloaded, quota, other } = item.errorBreakdown
          if (overloaded > 0 && quota === 0 && other === 0) {
            return `${value} (überlastet)`
          }
          if (quota > 0 && overloaded === 0 && other === 0) {
            return `${value} (Quote)`
          }
          return Math.round(value)
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#71717a' }
      },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, color: '#71717a' },
        grid: { color: 'rgba(113, 113, 122, 0.1)' }
      },
    },
  }

  const renderErrorBadges = () => {
    if (totalErrors === 0) return null
    return (
      <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-500 font-medium">Fehlerursachen (letzte 3 Tage):</span>
        {totalOverloaded > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
            ⚠️ {totalOverloaded}x Modell überlastet (503)
          </span>
        )}
        {totalQuota > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 font-medium">
            🚫 {totalQuota}x Quote erschöpft (429)
          </span>
        )}
        {totalOther > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300 font-medium">
            ❓ {totalOther}x Sonstige Fehler
          </span>
        )}
      </div>
    )
  }

  if (embedded) {
    return (
      <div>
        <h3 className="text-base font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
          Google API Aufrufe (letzte 3 Tage)
        </h3>
        <div className="h-[280px]">
          <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
        </div>
        {renderErrorBadges()}
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm mb-8">
      <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
        Google API Aufrufe (letzte 3 Tage)
      </h2>
      <div className="h-[300px]">
        <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
      </div>
      {renderErrorBadges()}
    </div>
  )
}
