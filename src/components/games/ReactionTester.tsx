"use client"

import { useState, useEffect, useRef } from "react"
import { motion } from "framer-motion"

export function ReactionTester({ onComplete }: { onComplete: () => void }) {
  const [state, setState] = useState<'waiting' | 'ready' | 'go' | 'result' | 'early'>('waiting')
  const [reactionTime, setReactionTime] = useState<number | null>(null)
  const [playCount, setPlayCount] = useState<number>(0)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<number>(0)

  const startGame = () => {
    setPlayCount(prev => prev + 1)
    setState('ready')
    setReactionTime(null)
    const delay = 1500 + Math.random() * 2500 // 1.5 to 4 seconds

    timerRef.current = setTimeout(() => {
      setState('go')
      startTimeRef.current = Date.now()
    }, delay)
  }

  useEffect(() => {
    // start initially
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startGame()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const handleClick = () => {
    if (state === 'ready') {
      if (timerRef.current) clearTimeout(timerRef.current)
      setState('early')
    } else if (state === 'go') {
      const rt = Date.now() - startTimeRef.current
      setReactionTime(rt)
      setState('result')
    }
  }

  if (state === 'result' || state === 'early') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-6 w-full">
         <motion.div
           initial={{ scale: 0.8, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-8 border border-zinc-200 dark:border-zinc-800"
         >
           <h2 className="text-2xl font-bold mb-4">
             {state === 'early' ? 'Fehlstart!' : 'Reaktionszeit'}
           </h2>

           <div className={`text-4xl font-black my-6 ${state === 'early' ? 'text-red-500' : 'text-blue-500'}`}>
             {state === 'early' ? 'Zu früh geklickt' : `${reactionTime} ms`}
           </div>

           <div className="flex gap-4 justify-center mt-8">
             {playCount < 3 && (
               <button
                 onClick={startGame}
                 className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition-colors"
               >
                 Nochmal
               </button>
             )}
             <button
               onClick={onComplete}
               className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm"
             >
               Weiterlernen
             </button>
           </div>
         </motion.div>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-center h-full w-full p-4 sm:p-6">
      <div
        onClick={handleClick}
        className={`w-full max-w-lg aspect-square sm:aspect-video rounded-3xl shadow-2xl cursor-pointer flex flex-col items-center justify-center transition-colors duration-75 select-none
          ${state === 'ready' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}
        `}
      >
         <span className="text-3xl sm:text-5xl font-black text-white tracking-wide text-center px-4">
           {state === 'ready' ? 'Bereithalten...' : 'JETZT KLICKEN!'}
         </span>
         {state === 'ready' && <span className="text-red-100 mt-4 text-lg font-medium">Warten auf Grün</span>}
      </div>
    </div>
  )
}
