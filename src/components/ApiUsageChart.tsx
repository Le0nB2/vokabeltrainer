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

export function ApiUsageChart({ data }: { data: ApiStatsResult[] }) {
  if (!data || data.length === 0) {
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

  // Define colors for each API Key (Key 1, Key 2, etc.)
  const colorPalettes = [
    { success: 'rgba(37, 99, 235, 0.8)', error: 'rgba(220, 38, 38, 0.8)' }, // Key 1: Blue / Red
    { success: 'rgba(16, 185, 129, 0.8)', error: 'rgba(245, 158, 11, 0.8)' }, // Key 2: Green / Amber
    { success: 'rgba(139, 92, 246, 0.8)', error: 'rgba(236, 72, 153, 0.8)' }, // Key 3: Purple / Pink
    { success: 'rgba(249, 115, 22, 0.8)', error: 'rgba(20, 184, 166, 0.8)' }, // Key 4: Orange / Teal
  ]

  for (let i = 0; i < uniqueKeys.length; i++) {
    const key = uniqueKeys[i]
    // Wir nutzen den stack-Parameter, um die Balken pro Key zu stapeln
    const stackName = `StackKey${key}`
    const colors = colorPalettes[i % colorPalettes.length]

    // Dataset für erfolgreiche Aufrufe dieses Keys
    datasets.push({
      label: `API ${key} (Erfolg)`,
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
      datalabels: {
        color: 'white',
        font: {
          weight: 'bold' as const,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        display: function(context: { dataset: any, dataIndex: number }) {
          // Nur anzeigen, wenn der Wert > 0 ist
          return context.dataset.data[context.dataIndex] > 0;
        },
        formatter: Math.round
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

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 shadow-sm mb-8">
      <h2 className="text-lg font-semibold mb-4 text-zinc-900 dark:text-zinc-100">
        Google API Aufrufe (letzte 3 Tage)
      </h2>
      <div className="h-[300px]">
        <Bar data={chartData} options={options} plugins={[ChartDataLabels]} />
      </div>
    </div>
  )
}
