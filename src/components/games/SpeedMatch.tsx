"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"

type Pair = { id: string, en: string, de: string }

export function SpeedMatch({
  pool,
  onComplete
}: {
  pool: { front: string, back: string }[],
  onComplete: () => void
}) {
  const [leftItems, setLeftItems] = useState<{id: string, text: string, matched: boolean}[]>([])
  const [rightItems, setRightItems] = useState<{id: string, text: string, matched: boolean}[]>([])

  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [selectedRight, setSelectedRight] = useState<string | null>(null)
  const [errorIds, setErrorIds] = useState<{left: string, right: string} | null>(null)
  const [matches, setMatches] = useState(0)

  useEffect(() => {
    // Select 5 random pairs
    const shuffledPool = [...pool].sort(() => 0.5 - Math.random())
    const selected = shuffledPool.slice(0, Math.min(5, shuffledPool.length))

    const pairs: Pair[] = selected.map((c, i) => ({
      id: `pair-${i}`,
      en: c.front,
      de: c.back
    }))

    const left = pairs.map(p => ({ id: p.id, text: p.en, matched: false })).sort(() => 0.5 - Math.random())
    const right = pairs.map(p => ({ id: p.id, text: p.de, matched: false })).sort(() => 0.5 - Math.random())

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLeftItems(left)
    setRightItems(right)
  }, [pool])

  useEffect(() => {
    if (selectedLeft && selectedRight) {
      if (selectedLeft === selectedRight) {
        // Match!
        setTimeout(() => {
          setLeftItems(prev => prev.map(item => item.id === selectedLeft ? { ...item, matched: true } : item))
          setRightItems(prev => prev.map(item => item.id === selectedRight ? { ...item, matched: true } : item))
          setSelectedLeft(null)
          setSelectedRight(null)
          setMatches(m => m + 1)
        }, 300) // Small delay to show green state
      } else {
        // Mismatch
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setErrorIds({ left: selectedLeft, right: selectedRight })
        setTimeout(() => {
          setSelectedLeft(null)
          setSelectedRight(null)
          setErrorIds(null)
        }, 500)
      }
    }
  }, [selectedLeft, selectedRight])

  useEffect(() => {
    if (matches > 0 && leftItems.length > 0 && matches === leftItems.length) {
      const t = setTimeout(() => {
        onComplete()
      }, 1500)
      return () => clearTimeout(t)
    }
  }, [matches, leftItems.length, onComplete])

  if (matches > 0 && leftItems.length > 0 && matches === leftItems.length) {
     return (
        <div className="flex flex-col items-center justify-center h-full text-center p-6">
           <motion.div
             initial={{ scale: 0.5, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             className="text-3xl sm:text-4xl font-bold text-green-500 mb-4"
           >
             Super gemacht!
           </motion.div>
           <p className="text-zinc-500 dark:text-zinc-400">Rückkehr zum Lernen...</p>
        </div>
     )
  }

  return (
    <div className="flex flex-col h-full items-center justify-start sm:justify-center p-4 sm:p-6 w-full max-w-2xl mx-auto overflow-y-auto">
      <h2 className="text-xl sm:text-2xl font-bold text-zinc-800 dark:text-zinc-100 mb-6 text-center">Speed-Match</h2>
      <div className="grid grid-cols-2 gap-2 sm:gap-8 w-full pb-8">
        {/* Left Column */}
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {leftItems.map((item) => !item.matched && (
              <motion.button
                key={`left-${item.id}`}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => !selectedLeft && setSelectedLeft(item.id)}
                className={`p-3 sm:p-4 rounded-xl shadow-sm text-center border-2 transition-all
                  ${selectedLeft === item.id && !errorIds
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : errorIds?.left === item.id
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 animate-[shake_0.5s_ease-in-out]'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-300'}
                `}
              >
                <span className="text-sm sm:text-base font-medium break-words hyphens-auto line-clamp-3 sm:line-clamp-none">{item.text}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-3">
          <AnimatePresence>
            {rightItems.map((item) => !item.matched && (
              <motion.button
                key={`right-${item.id}`}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => !selectedRight && setSelectedRight(item.id)}
                className={`p-3 sm:p-4 rounded-xl shadow-sm text-center border-2 transition-all
                  ${selectedRight === item.id && !errorIds
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : errorIds?.right === item.id
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 animate-[shake_0.5s_ease-in-out]'
                    : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:border-blue-300'}
                `}
              >
                 <span className="text-sm sm:text-base font-medium break-words hyphens-auto line-clamp-3 sm:line-clamp-none">{item.text}</span>
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
