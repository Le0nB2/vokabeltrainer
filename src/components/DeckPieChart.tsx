"use client"

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

ChartJS.register(ArcElement, Tooltip, Legend);

interface DeckPieChartProps {
  boxes: number[]; // Array of 7 integers
  totalCards: number;
}

export function DeckPieChart({ boxes, totalCards }: DeckPieChartProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted ? resolvedTheme === 'dark' : false;
  const totalInBoxes = boxes.reduce((acc, curr) => acc + curr, 0);

  if (totalCards === 0 || totalInBoxes === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg border border-dashed border-zinc-200 dark:border-zinc-700">
        <span className="text-zinc-400 text-sm">
          {totalCards === 0 ? "Keine Karten" : "Keine Stufendaten"}
        </span>
      </div>
    );
  }

  const data = {
    labels: ['Stufe 1', 'Stufe 2', 'Stufe 3', 'Stufe 4', 'Stufe 5', 'Stufe 6', 'Stufe 7'],
    datasets: [
      {
        data: boxes,
        backgroundColor: [
          'rgba(59, 130, 246, 0.2)', // blue-500/20
          'rgba(59, 130, 246, 0.3)',
          'rgba(59, 130, 246, 0.4)',
          'rgba(59, 130, 246, 0.5)',
          'rgba(59, 130, 246, 0.6)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(59, 130, 246, 1.0)',
        ],
        borderColor: [
          isDark ? 'rgba(39, 39, 42, 1)' : 'rgba(255, 255, 255, 1)', // zinc-800 or white
        ],
        borderWidth: 1,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function(context: { raw: unknown, label: string }) {
            const count = typeof context.raw === 'number' ? context.raw : 0;
            const percentage = Math.round((count / totalCards) * 100);
            return `${context.label}: ${count} Karten (${percentage}%)`;
          }
        }
      }
    },
  };

  return (
    <div className="h-48 relative">
      <Pie data={data} options={options} />
    </div>
  );
}
