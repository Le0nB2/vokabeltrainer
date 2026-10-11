"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

export function BalloonPop({ onComplete }: { onComplete: () => void }) {
  const [timeLeft, setTimeLeft] = useState(20)
  const [score, setScore] = useState(0)
  const [balloons, setBalloons] = useState<{id: number, x: number, color: string, speed: number}[]>([])
  const nextId = useRef(0)



  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (timeLeft === 0) {
      const t = setTimeout(() => onComplete(), 2500)
      return () => clearTimeout(t)
    }


    const colors = ["bg-red-400", "bg-blue-400", "bg-green-400", "bg-yellow-400", "bg-purple-400", "bg-pink-400"];
    const spawner = setInterval(() => {
      setBalloons(prev => {
        if (prev.length > 8) return prev
        const newBalloon = {
          id: nextId.current++,
          x: 10 + Math.random() * 80, // percentage
          color: colors[Math.floor(Math.random() * colors.length)],
          speed: 4 + Math.random() * 4 // seconds to reach top
        }
        return [...prev, newBalloon]
      })
    }, 800)

    return () => clearInterval(spawner)
  }, [timeLeft, onComplete])

  const popBalloon = (id: number) => {
    setBalloons(prev => prev.filter(b => b.id !== id))
    setScore(s => s + 1)
  }

  if (timeLeft === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6">
         <motion.div
           initial={{ scale: 0.5, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="text-3xl sm:text-4xl font-bold text-blue-500 mb-4"
         >
           Zeit abgelaufen!
         </motion.div>
         <p className="text-xl font-medium text-zinc-700 dark:text-zinc-300 mb-2">Du hast {score} Ballons zerplatzt!</p>
         <p className="text-zinc-500 dark:text-zinc-400">Rückkehr zum Lernen...</p>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col p-4">
      <div className="flex justify-between items-center mb-4 z-10">
        <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Score: {score}</div>
        <div className="text-lg font-bold text-red-500">{timeLeft}s</div>
      </div>

      <div className="flex-1 relative border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/50 cursor-crosshair transform-gpu">
        <AnimatePresence>
          {balloons.map(b => (
            <motion.div
              key={b.id}
              initial={{ bottom: "-20%", scale: 0, opacity: 0 }}
              animate={{ bottom: "120%", scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0, transition: { duration: 0.2 } }}
              transition={{ bottom: { duration: b.speed, ease: "linear" }, scale: { duration: 0.2 }, opacity: { duration: 0.2 } }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              onAnimationComplete={(def: any) => {
                 // Remove balloon if it reached top without being popped
                 if (def && typeof def === 'object' && 'bottom' in def && def.bottom === "120%") {
                    setBalloons(prev => prev.filter(bl => bl.id !== b.id))
                 }
              }}
              onClick={() => popBalloon(b.id)}
              className={`absolute w-16 h-20 sm:w-20 sm:h-24 ${b.color} rounded-[50%] shadow-lg cursor-pointer flex items-center justify-center`}
              style={{ left: `calc(${b.x}% - 2rem)` }}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <div className="w-1 h-8 bg-zinc-300 absolute -bottom-7 rounded-full opacity-50"></div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}
