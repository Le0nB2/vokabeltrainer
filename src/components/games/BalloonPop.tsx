"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Zap, Sparkles, Bomb, Flame, RotateCcw, ArrowRight, Trophy } from "lucide-react"

type BalloonType = "normal" | "speedy" | "golden" | "bomb"

interface Balloon {
  id: number
  x: number // percentage
  type: BalloonType
  color: string
  speed: number // duration in seconds
  drift: number // horizontal wobble in px
  points: number
  size: "sm" | "md"
}

interface FloatingScore {
  id: number
  text: string
  color: string
  x: number
  y: number
}

const NORMAL_COLORS = [
  "from-rose-500 to-red-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-purple-500 to-violet-600",
  "from-pink-500 to-rose-600",
  "from-amber-400 to-orange-500",
]

export function BalloonPop({ onComplete }: { onComplete: () => void }) {
  const [timeLeft, setTimeLeft] = useState(20)
  const [score, setScore] = useState(0)
  const [poppedCount, setPoppedCount] = useState(0)
  const [escapedCount, setEscapedCount] = useState(0)
  const [bombsHit, setBombsHit] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [comboDisplay, setComboDisplay] = useState(0)
  const [screenShake, setScreenShake] = useState(false)
  const [playCount, setPlayCount] = useState(1)
  const [gameKey, setGameKey] = useState(0)
  const [balloons, setBalloons] = useState<Balloon[]>([])
  const [floatingScores, setFloatingScores] = useState<FloatingScore[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const nextId = useRef(0)
  const nextFloatingId = useRef(0)
  const lastPopTime = useRef<number>(0)
  const comboCount = useRef<number>(0)
  const poppedIds = useRef<Set<number>>(new Set())
  const timeLeftRef = useRef(timeLeft)
  const balloonsRef = useRef(balloons)

  useEffect(() => {
    timeLeftRef.current = timeLeft
  }, [timeLeft])

  useEffect(() => {
    balloonsRef.current = balloons
  }, [balloons])

  // Sound synthesis via Web Audio API (graceful fallback)
  const playPopSound = (type: BalloonType) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      if (ctx.state === "suspended") {
        ctx.resume()
      }
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      const now = ctx.currentTime

      if (type === "bomb") {
        osc.type = "sawtooth"
        osc.frequency.setValueAtTime(140, now)
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.25)
        gain.gain.setValueAtTime(0.25, now)
        gain.gain.linearRampToValueAtTime(0.01, now + 0.25)
        osc.start(now)
        osc.stop(now + 0.25)
      } else if (type === "golden") {
        osc.type = "sine"
        osc.frequency.setValueAtTime(587, now)
        osc.frequency.setValueAtTime(880, now + 0.08)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2)
        osc.start(now)
        osc.stop(now + 0.2)
      } else if (type === "speedy") {
        osc.type = "triangle"
        osc.frequency.setValueAtTime(500, now)
        osc.frequency.exponentialRampToValueAtTime(850, now + 0.08)
        gain.gain.setValueAtTime(0.18, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08)
        osc.start(now)
        osc.stop(now + 0.08)
      } else {
        osc.type = "sine"
        osc.frequency.setValueAtTime(420, now)
        osc.frequency.exponentialRampToValueAtTime(130, now + 0.06)
        gain.gain.setValueAtTime(0.2, now)
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06)
        osc.start(now)
        osc.stop(now + 0.06)
      }
    } catch {
      // Audio unavailable or blocked
    }
  }

  // Create a new balloon with balanced speed and smooth drift
  const createBalloon = useCallback((timeRemaining: number): Balloon => {
    const id = nextId.current++
    const rand = Math.random()
    const x = 10 + Math.random() * 78 // Keep comfortably away from borders
    const drift = (Math.random() - 0.5) * 14 // Smooth and gentle sway

    // Speed progression:
    // Early (>12s): 3.0s - 3.8s base (pleasant & manageable)
    // Mid (6s - 12s): 2.4s - 3.1s base (accelerating)
    // Frenzy (<=6s): 1.9s - 2.5s base (fast & thrilling finale)
    let baseSpeed: number
    if (timeRemaining > 12) {
      baseSpeed = 3.0 + Math.random() * 0.8
    } else if (timeRemaining > 6) {
      baseSpeed = 2.4 + Math.random() * 0.7
    } else {
      baseSpeed = 1.9 + Math.random() * 0.6
    }

    if (rand < 0.14) {
      return {
        id,
        x,
        type: "bomb",
        color: "from-zinc-800 via-zinc-900 to-black",
        speed: baseSpeed * 1.05,
        drift,
        points: -3,
        size: "md",
      }
    }

    if (rand < 0.26) {
      return {
        id,
        x,
        type: "golden",
        color: "from-amber-300 via-yellow-400 to-amber-500",
        speed: baseSpeed * 0.88,
        drift,
        points: 5,
        size: "md",
      }
    }

    if (rand < 0.44) {
      return {
        id,
        x,
        type: "speedy",
        color: "from-cyan-400 via-sky-500 to-blue-600",
        speed: baseSpeed * 0.8,
        drift,
        points: 2,
        size: "sm",
      }
    }

    const normalColor = NORMAL_COLORS[Math.floor(Math.random() * NORMAL_COLORS.length)]
    return {
      id,
      x,
      type: "normal",
      color: normalColor,
      speed: baseSpeed,
      drift,
      points: 1,
      size: "md",
    }
  }, [])

  // Timer loop
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
  }, [gameKey])

  // Spawner loop with balanced intervals
  useEffect(() => {
    let timeoutId: NodeJS.Timeout
    let isRunning = true

    const spawnLoop = () => {
      if (!isRunning || timeLeftRef.current <= 0) return

      const currentRemaining = timeLeftRef.current
      const currentCount = balloonsRef.current.length

      // Dynamic spawn delay: if few balloons are left, replenish almost instantly so screen is never empty!
      let delay = 450
      if (currentCount < 3) {
        delay = 120
      } else if (currentRemaining <= 6) {
        delay = 200 + Math.random() * 90 // Rapid endspurt: 200ms - 290ms
      } else if (currentRemaining <= 12) {
        delay = 340 + Math.random() * 110 // Mid-game: 340ms - 450ms
      } else {
        delay = 480 + Math.random() * 130 // Early: 480ms - 610ms
      }

      timeoutId = setTimeout(() => {
        if (!isRunning || timeLeftRef.current <= 0) return

        setBalloons(prev => {
          if (prev.length >= 12) return prev
          const b1 = createBalloon(timeLeftRef.current)
          // In endspurt (final 6s) or if screen has very few balloons, spawn two at once
          if ((timeLeftRef.current <= 6 || prev.length < 3) && prev.length < 11) {
            const b2 = createBalloon(timeLeftRef.current)
            b2.x = ((b1.x + 36) % 76) + 10
            return [...prev, b1, b2]
          }
          return [...prev, b1]
        })

        spawnLoop()
      }, delay)
    }

    spawnLoop()

    return () => {
      isRunning = false
      clearTimeout(timeoutId)
    }
  }, [gameKey, createBalloon])

  // Reset combo display if idle for >1000ms
  useEffect(() => {
    if (comboDisplay <= 1) return
    const timer = setTimeout(() => {
      setComboDisplay(0)
      comboCount.current = 0
    }, 1000)
    return () => clearTimeout(timer)
  }, [comboDisplay])

  const addFloatingScore = (text: string, color: string, x: number, y: number) => {
    const fId = nextFloatingId.current++
    setFloatingScores(prev => [...prev.slice(-10), { id: fId, text, color, x, y }])
  }

  // Pop handler triggered immediately on pointerdown (touch or click)
  const popBalloon = useCallback((b: Balloon, e: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation()
    if (poppedIds.current.has(b.id)) return
    poppedIds.current.add(b.id)

    playPopSound(b.type)

    let clickX = 50
    let clickY = 50
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      clickX = e.clientX ? e.clientX - rect.left : (b.x / 100) * rect.width
      clickY = e.clientY ? e.clientY - rect.top : rect.height / 2
    }

    setBalloons(prev => prev.filter(bl => bl.id !== b.id))

    if (b.type === "bomb") {
      comboCount.current = 0
      setComboDisplay(0)
      setBombsHit(prev => prev + 1)
      setScore(s => Math.max(0, s - 3))
      setScreenShake(true)
      setTimeout(() => setScreenShake(false), 400)
      addFloatingScore("-3 💣", "text-red-500", clickX, clickY)
      return
    }

    const now = Date.now()
    let currentCombo = 1
    if (now - lastPopTime.current < 1000) {
      comboCount.current += 1
      currentCombo = comboCount.current
    } else {
      comboCount.current = 1
      currentCombo = 1
    }
    lastPopTime.current = now
    setComboDisplay(currentCombo)
    setMaxCombo(prev => Math.max(prev, currentCombo))

    const comboBonus = currentCombo >= 4 ? 2 : currentCombo >= 2 ? 1 : 0
    const totalPoints = b.points + comboBonus

    setScore(s => s + totalPoints)
    setPoppedCount(p => p + 1)

    let text = `+${totalPoints}`
    let colorClass = "text-emerald-500"
    if (b.type === "golden") {
      text = `+${totalPoints} ⭐`
      colorClass = "text-amber-500"
    } else if (b.type === "speedy") {
      text = `+${totalPoints} ⚡`
      colorClass = "text-cyan-500"
    }

    if (currentCombo >= 3) {
      text += ` (${currentCombo}x)`
    }

    addFloatingScore(text, colorClass, clickX, clickY)
  }, [])

  const restartGame = () => {
    if (playCount >= 3) return
    setPlayCount(p => p + 1)
    setTimeLeft(20)
    setScore(0)
    setPoppedCount(0)
    setEscapedCount(0)
    setBombsHit(0)
    setMaxCombo(0)
    setComboDisplay(0)
    setBalloons([])
    setFloatingScores([])
    comboCount.current = 0
    poppedIds.current.clear()
    setGameKey(k => k + 1)
  }

  const getRank = (sc: number) => {
    if (sc >= 45) return { title: "Unaufhaltsam!", badge: "Legende 🏆", color: "text-amber-500" }
    if (sc >= 30) return { title: "Ballon-Meister!", badge: "Meisterhaft 🎯", color: "text-purple-500" }
    if (sc >= 18) return { title: "Flotte Finger!", badge: "Blitzschnell ⚡", color: "text-blue-500" }
    return { title: "Guter Versuch!", badge: "Aufwärmrunde 🎈", color: "text-zinc-600 dark:text-zinc-400" }
  }

  if (timeLeft === 0) {
    const rank = getRank(score)
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-4 sm:p-6 max-w-lg mx-auto w-full">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full bg-white dark:bg-zinc-900 rounded-3xl shadow-xl p-6 sm:p-8 border border-zinc-200 dark:border-zinc-800 flex flex-col items-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/50 flex items-center justify-center mb-4 text-blue-500">
            <Trophy className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100 mb-1">
            Zeit abgelaufen!
          </h2>
          <div className={`text-sm sm:text-base font-semibold ${rank.color} mb-4`}>
            {rank.title} • {rank.badge}
          </div>

          <div className="text-5xl font-black text-blue-600 dark:text-blue-400 mb-6">
            {score} <span className="text-xl font-bold text-zinc-500">Pkt.</span>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full mb-6 text-left">
            <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Zerplatzt</div>
              <div className="text-lg font-bold text-zinc-800 dark:text-zinc-200">🎈 {poppedCount}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Entkommen</div>
              <div className="text-lg font-bold text-zinc-800 dark:text-zinc-200">💨 {escapedCount}</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Max Combo</div>
              <div className="text-lg font-bold text-zinc-800 dark:text-zinc-200">🔥 {maxCombo}x</div>
            </div>
            <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Bomben getroffen</div>
              <div className={`text-lg font-bold ${bombsHit > 0 ? "text-red-500" : "text-emerald-500"}`}>
                💣 {bombsHit}
              </div>
            </div>
          </div>

          <div className="flex gap-3 w-full">
            {playCount < 3 && (
              <button
                onClick={restartGame}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl font-medium transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Nochmal {playCount === 2 ? "(letzte Runde)" : `(${3 - playCount} übrig)`}
              </button>
            )}
            <button
              onClick={onComplete}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-sm"
            >
              Weiterlernen
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full overflow-hidden flex flex-col p-4 select-none">
      {/* Top Header */}
      <div className="flex justify-between items-center mb-3 z-10 px-1">
        <div className="flex items-center gap-3">
          <div className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <span>Score: <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{score}</span></span>
            {playCount > 1 && (
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full border border-zinc-200 dark:border-zinc-700">
                Spiel {playCount}/3
              </span>
            )}
          </div>
          {comboDisplay >= 2 && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-extrabold text-xs sm:text-sm border border-amber-500/30"
            >
              <Flame className="w-3.5 h-3.5 fill-amber-500" />
              <span>{comboDisplay}x Combo!</span>
            </motion.div>
          )}
        </div>

        {timeLeft <= 6 && (
          <motion.div
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ repeat: Infinity, duration: 0.5 }}
            className="hidden sm:inline-flex items-center gap-1 text-xs font-black text-red-500 uppercase tracking-wider bg-red-100 dark:bg-red-950/60 px-2.5 py-1 rounded-full border border-red-300 dark:border-red-800"
          >
            🔥 Endspurt!
          </motion.div>
        )}

        <div className={`text-lg font-bold ${timeLeft <= 5 ? "text-red-500 animate-pulse" : "text-zinc-700 dark:text-zinc-300"}`}>
          {timeLeft}s
        </div>
      </div>

      {/* Play Area */}
      <motion.div
        ref={containerRef}
        animate={screenShake ? { x: [-8, 8, -6, 6, -3, 3, 0], y: [-3, 3, -2, 2, 0] } : { x: 0, y: 0 }}
        transition={{ duration: 0.35 }}
        className={`flex-1 relative border-2 border-dashed rounded-2xl overflow-hidden cursor-crosshair transform-gpu transition-colors duration-150 ${
          screenShake
            ? "border-red-500 bg-red-500/10 ring-4 ring-red-500/20"
            : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/40"
        }`}
      >
        {/* Floating Scores */}
        <AnimatePresence>
          {floatingScores.map(f => (
            <motion.div
              key={f.id}
              initial={{ opacity: 1, scale: 0.8, y: 0 }}
              animate={{ opacity: 0, scale: 1.3, y: -45 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              onAnimationComplete={() => {
                setFloatingScores(prev => prev.filter(item => item.id !== f.id))
              }}
              className={`absolute pointer-events-none font-black text-xl sm:text-2xl select-none z-30 drop-shadow-md -translate-x-1/2 -translate-y-1/2 ${f.color}`}
              style={{ left: f.x, top: f.y }}
            >
              {f.text}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Balloons */}
        <AnimatePresence>
          {balloons.map(b => (
            <motion.div
              key={b.id}
              initial={{ bottom: "-5%", scale: 0.6, opacity: 0 }}
              animate={{
                bottom: "115%",
                scale: 1,
                opacity: 1,
                x: [0, b.drift, -b.drift, 0],
              }}
              exit={{
                scale: [1, 1.45, 0],
                opacity: [1, 0.9, 0],
                transition: { duration: 0.18, ease: "easeOut" },
              }}
              transition={{
                bottom: { duration: b.speed, ease: "linear" },
                x: { duration: b.speed, ease: "easeInOut", repeat: Infinity },
                scale: { duration: 0.15 },
                opacity: { duration: 0.15 },
              }}
              onAnimationComplete={(def) => {
                if (
                  def &&
                  typeof def === "object" &&
                  "bottom" in def &&
                  (def as { bottom: string }).bottom === "115%"
                ) {
                  if (poppedIds.current.has(b.id)) {
                    poppedIds.current.delete(b.id)
                    return
                  }
                  setBalloons(prev => prev.filter(bl => bl.id !== b.id))
                  if (b.type !== "bomb") {
                    setEscapedCount(prev => prev + 1)
                  }
                }
              }}
              onPointerDown={(e) => popBalloon(b, e)}
              onClick={(e) => popBalloon(b, e)}
              className="absolute cursor-pointer select-none touch-manipulation transform-gpu p-3 -translate-x-1/2"
              style={{ left: `${b.x}%` }}
            >
              {b.type === "bomb" ? (
                <div className="relative w-14 h-14 sm:w-15 sm:h-15 bg-gradient-to-br from-zinc-800 via-zinc-900 to-black rounded-full border-2 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.5)] flex items-center justify-center pointer-events-none">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
                    <span className="w-0.5 h-2 bg-amber-600 inline-block -mt-1" />
                  </div>
                  <Bomb className="w-7 h-7 text-red-500 drop-shadow pointer-events-none" />
                  <div className="absolute top-2 left-2.5 w-3 h-3 bg-white/20 rounded-full pointer-events-none" />
                </div>
              ) : b.type === "golden" ? (
                <div className="relative w-15 h-19 sm:w-16 sm:h-20 bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 rounded-[50%_50%_50%_50%_/_42%_42%_58%_58%] border-2 border-yellow-200/90 shadow-[0_0_18px_rgba(251,191,36,0.6)] flex items-center justify-center pointer-events-none">
                  <div className="absolute top-2 left-2.5 w-3 h-5 bg-white/60 rounded-full -rotate-30 pointer-events-none" />
                  <Sparkles className="w-7 h-7 text-amber-900/80 drop-shadow animate-pulse pointer-events-none" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1.5 bg-amber-600 rounded-b-sm pointer-events-none" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-7 bg-amber-600/50 pointer-events-none" />
                </div>
              ) : b.type === "speedy" ? (
                <div className="relative w-13 h-17 sm:w-14 sm:h-18 bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-600 rounded-[50%_50%_50%_50%_/_42%_42%_58%_58%] border-2 border-cyan-200/90 shadow-[0_0_14px_rgba(6,182,212,0.6)] flex items-center justify-center pointer-events-none">
                  <div className="absolute top-1.5 left-2 w-2.5 h-4 bg-white/60 rounded-full -rotate-30 pointer-events-none" />
                  <Zap className="w-5 h-5 text-white fill-white drop-shadow animate-pulse pointer-events-none" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1.5 bg-blue-700 rounded-b-sm pointer-events-none" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-6 bg-blue-500/50 pointer-events-none" />
                </div>
              ) : (
                <div
                  className={`relative w-15 h-19 sm:w-16 sm:h-20 bg-gradient-to-br ${b.color} rounded-[50%_50%_50%_50%_/_42%_42%_58%_58%] shadow-[inset_-3px_-3px_8px_rgba(0,0,0,0.25),_0_6px_12px_rgba(0,0,0,0.18)] flex items-center justify-center pointer-events-none`}
                >
                  <div className="absolute top-2 left-2.5 w-3 h-5 bg-white/45 rounded-full -rotate-30 pointer-events-none" />
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-1.5 bg-black/20 rounded-b-sm pointer-events-none" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 w-0.5 h-7 bg-zinc-400/50 dark:bg-zinc-500/50 pointer-events-none" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {/* Legend / Info bar */}
      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 mt-3 text-xs sm:text-sm font-medium text-zinc-500 dark:text-zinc-400 select-none">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shadow-sm" />
          <span>Standard (+1)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block shadow-sm" />
          <span>Tempo (+2 ⚡)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-sm" />
          <span>Gold (+5 ⭐)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-800 border border-red-500 inline-block shadow-sm" />
          <span className="text-red-500 font-semibold">Gefahr (-3 💣)</span>
        </div>
      </div>
    </div>
  )
}
