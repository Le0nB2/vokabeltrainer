"use client"

import { useState, useEffect } from "react"
import { X, Info } from "lucide-react"
import { SpeedMatch } from "./SpeedMatch"
import { BalloonPop } from "./BalloonPop"
import { ReactionTester } from "./ReactionTester"
import { WordDrop } from "./WordDrop"

type Settings = {
  minigamesEnabled: boolean
  minigameIntervalMin: number
  minigameIntervalMax: number
  speedMatchEnabled: boolean
  balloonPopEnabled: boolean
  reactionTesterEnabled: boolean
  wordDropEnabled: boolean
}

export function MinigameOverlay({
  onClose,
  settings,
  pool
}: {
  onClose: () => void,
  settings: Settings,
  pool: { front: string, back: string }[]
}) {
  const [activeGame, setActiveGame] = useState<string | null>(null)
  const [showInstructions, setShowInstructions] = useState(false)

  useEffect(() => {
    if (activeGame) return;
    const available = []
    if (settings.speedMatchEnabled && pool.length >= 5) available.push('speed')
    if (settings.balloonPopEnabled) available.push('balloon')
    if (settings.reactionTesterEnabled) available.push('reaction')
    if (settings.wordDropEnabled && pool.length >= 4) available.push('word')

    if (available.length === 0) {
      onClose()
      return
    }

    const randomGame = available[Math.floor(Math.random() * available.length)]
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveGame(randomGame)
  }, [settings, pool, onClose, activeGame])

  if (!activeGame) return null

  const instructions: Record<string, string> = {
    speed: "Verbinde die passenden Paare (Deutsch und Englisch) so schnell wie möglich.",
    balloon: "Klicke auf die Ballons, um sie platzen zu lassen und Punkte zu sammeln, bevor die Zeit abläuft.",
    reaction: "Warte auf das grüne Signal und klicke dann so schnell du kannst.",
    word: "Fange die herabfallenden englischen Wörter, die zur deutschen Bedeutung passen."
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/90 backdrop-blur-sm p-4 sm:p-8 animate-in fade-in duration-300">
      <div className="relative w-full max-w-4xl h-[80vh] bg-white dark:bg-zinc-950 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-zinc-100 dark:border-zinc-800">
          <div className="font-semibold text-zinc-500 uppercase tracking-wider text-sm">Pausen-Spiel</div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-full text-sm font-medium transition-colors text-blue-600 dark:text-blue-400"
            >
              Anleitung <Info className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-full text-sm font-medium transition-colors"
            >
              Überspringen <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Game Area */}
        <div className="flex-1 overflow-hidden relative transform-gpu">
          {showInstructions && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/95 dark:bg-zinc-950/95 backdrop-blur-sm p-8">
              <div className="max-w-md text-center space-y-6">
                <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Info className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Spielanleitung</h3>
                <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {instructions[activeGame]}
                </p>
                <button
                  onClick={() => setShowInstructions(false)}
                  className="mt-8 px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-medium transition-colors"
                >
                  Verstanden, los geht's!
                </button>
              </div>
            </div>
          )}
          {activeGame === 'speed' && <SpeedMatch pool={pool} onComplete={onClose} />}
          {activeGame === 'balloon' && <BalloonPop onComplete={onClose} />}
          {activeGame === 'reaction' && <ReactionTester onComplete={onClose} />}
          {activeGame === 'word' && <WordDrop pool={pool} onComplete={onClose} />}
        </div>
      </div>
    </div>
  )
}
