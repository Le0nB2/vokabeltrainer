"use client"

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';
import ChartDataLabels from 'chartjs-plugin-datalabels';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface LearningStatsChartProps {
  stats: {
    date: string;
    correct: number;
    incorrect: number;
  }[];
}

export function LearningStatsChart({ stats }: LearningStatsChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Default to a safe color if not mounted to prevent hydration mismatch flashes
  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const textColor = isDark ? '#f4f4f5' : '#18181b'; // zinc-100 / zinc-900

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          color: textColor,
        }
      },
      title: {
        display: true,
        text: 'Lernaktivität (Letzte 7 Tage)',
        color: textColor,
        font: {
          weight: 'bold' as const,
        }
      },
      datalabels: {
        color: textColor,
        font: {
          weight: 'bold' as const,
          size: 11,
        },
        anchor: 'end' as const,
        align: 'top' as const,
        offset: 2,
        clip: false,
        display: function(context: { dataset: any, dataIndex: number }) {
          return context.dataset.data[context.dataIndex] > 0;
        },
        formatter: Math.round,
      },
    },
    scales: {
      x: {
        ticks: {
          color: textColor,
        },
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        }
      },
      y: {
        beginAtZero: true,
        grace: '8%',
        ticks: {
          color: textColor,
        },
        grid: {
          color: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        }
      }
    }
  };

  const data = {
    labels: stats.map(s => s.date),
    datasets: [
      {
        label: 'Richtig',
        data: stats.map(s => s.correct),
        backgroundColor: isDark ? 'rgba(34, 197, 94, 0.75)' : 'rgba(34, 197, 94, 0.5)',
        borderColor: 'rgb(34, 197, 94)',
        borderWidth: 1,
      },
      {
        label: 'Falsch',
        data: stats.map(s => s.incorrect),
        backgroundColor: isDark ? 'rgba(239, 68, 68, 0.75)' : 'rgba(239, 68, 68, 0.5)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800 mt-12 h-96">
      <Bar options={options} data={data} plugins={[ChartDataLabels]} />
    </div>
  );
}
