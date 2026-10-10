"use client"

import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"

export function WordDrop({
  pool,
  onComplete
}: {
  pool: { front: string, back: string }[],
  onComplete: () => void
}) {
  const [round, setRound] = useState(1)
  const [score, setScore] = useState(0)
  const [currentWord, setCurrentWord] = useState<{ de: string, en: string, options: { id: number, text: string, x: number, isCorrect: boolean }[] } | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const setupRound = useCallback(() => {
    if (round > 3) {
      setGameOver(true)
      return
    }

    setIsTransitioning(false)
    const shuffledPool = [...pool].sort(() => 0.5 - Math.random())
    const target = shuffledPool[0]

    // get distrators
    const distractors = shuffledPool.slice(1, 4)
    if (distractors.length < 3) {
      // not enough words, duplicate some (edge case for very small decks)
      while(distractors.length < 3) {
        distractors.push(shuffledPool[Math.floor(Math.random() * shuffledPool.length)])
      }
    }

    const options = [
      { text: target.front, isCorrect: true },
      ...distractors.map(d => ({ text: d.front, isCorrect: false }))
    ].sort(() => 0.5 - Math.random()).map((opt, i) => ({
      id: i,
      text: opt.text,
      isCorrect: opt.isCorrect,
      x: 10 + (i * 20) + (Math.random() * 10) // Spread them out horizontally
    }))

    setCurrentWord({ de: target.back, en: target.front, options })
  }, [pool, round])


  useEffect(() => {
    if (pool.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setupRound()
    } else {
      setGameOver(true)
    }
  }, [pool, round, setupRound]) // Trigger when pool or round changes

  const handleCatch = (isCorrect: boolean, id: number) => {
    if (isTransitioning) return
    setIsTransitioning(true)

    if (isCorrect) {
      setScore(s => s + 100)
    }

    // Remove the caught option for visual effect
    setCurrentWord(prev => prev ? { ...prev, options: prev.options.filter(o => o.id !== id) } : null)

    setTimeout(() => {
      setRound(r => r + 1)
    }, 500)
  }

  useEffect(() => {
    if (gameOver) {
      const t = setTimeout(() => onComplete(), 2000)
      return () => clearTimeout(t)
    }
  }, [gameOver, onComplete])

  if (gameOver) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
         <motion.div
           initial={{ scale: 0.5, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="text-3xl sm:text-4xl font-bold text-blue-500 mb-4"
         >
           Spiel beendet!
         </motion.div>
         <p className="text-xl font-medium text-zinc-700 dark:text-zinc-300 mb-2">Score: {score}</p>
         <p className="text-zinc-500 dark:text-zinc-400">Rückkehr zum Lernen...</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col p-4 max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-2 z-10 bg-white/80 dark:bg-zinc-900/80 p-4 rounded-xl shadow-sm backdrop-blur-sm border border-zinc-200 dark:border-zinc-800">
        <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Runde {round}/3</div>
        <div className="text-2xl font-black text-blue-600">{currentWord?.de}</div>
        <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Score: {score}</div>
      </div>

      <div className="flex-1 relative border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-950 mt-4">
        {currentWord && !isTransitioning && (
          <AnimatePresence>
            {currentWord.options.map((opt) => (
              <motion.button
                key={opt.id}
                initial={{ y: -50, x: `${opt.x}%`, opacity: 0 }}
                animate={{ y: 800, x: `${opt.x}%`, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                // eslint-disable-next-line react-hooks/purity
                transition={{ y: { duration: 6 + Math.random() * 2, ease: "linear" } }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                onAnimationComplete={(def: any) => {
                  if (def && typeof def === 'object' && 'y' in def && def.y === 800) {
                     // Missed it
                     if (opt.isCorrect && !isTransitioning) {
                        setIsTransitioning(true)
                        setTimeout(() => setRound(r => r + 1), 500)
                     }
                  }
                }}
                onClick={() => handleCatch(opt.isCorrect, opt.id)}
                className="absolute top-0 px-4 py-3 bg-white dark:bg-zinc-800 border-2 border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg cursor-pointer transform -translate-x-1/2 hover:border-blue-500 text-sm sm:text-base font-semibold"
                style={{ left: `${opt.x}%` }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                {opt.text}
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
