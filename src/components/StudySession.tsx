"use client"

import { useState, useEffect } from "react"
import { updateCardProgress } from "@/actions/cards"
import { saveDeckResult } from "@/actions/decks"
import Link from "next/link"
import { ArrowLeft, Check, X, RotateCcw, Volume2, Brain, Zap, Keyboard, Type } from "lucide-react"
import { evaluateAnswer } from "@/lib/utils/string"
import { MinigameOverlay } from "./games/MinigameOverlay"

export function StudySession({ deck, dueCards, settings }: { deck: { id: string, lastResultCorrect?: number | null, lastResultIncorrect?: number | null, cards: { id: string, deckId?: string, front: string, back: string, notes?: string | null, box: number, gapText?: string | null, lapses: number, mnemonic?: string | null }[] }, dueCards: { id: string, deckId?: string, front: string, back: string, notes?: string | null, box: number, gapText?: string | null, lapses: number, mnemonic?: string | null }[], settings: {minigamesEnabled: boolean, minigameIntervalMin: number, minigameIntervalMax: number, speedMatchEnabled: boolean, balloonPopEnabled: boolean, reactionTesterEnabled: boolean, wordDropEnabled: boolean} }) {
  const [cards, setCards] = useState(dueCards)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [sessionCompleted, setSessionCompleted] = useState(dueCards.length === 0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [stats, setStats] = useState({ correct: 0, incorrect: 0 })
  const [showGapText, setShowGapText] = useState(false)
  const [askDirection, setAskDirection] = useState<'en-de' | 'de-en'>('en-de')
  const [sessionCardCount, setSessionCardCount] = useState(0)
  const [studyMode, setStudyMode] = useState<'smart' | 'classic'>('smart')
  const [typingInput, setTypingInput] = useState('')
  const [typingFeedback, setTypingFeedback] = useState<{ status: string, message: string, rating: 'again' | 'hard' | 'good' | 'easy' } | null>(null)
  const isGlobal = deck.id === 'global';


  const [showMinigame, setShowMinigame] = useState(false)

  const [nextMinigameThreshold, setNextMinigameThreshold] = useState(() => settings.minigameIntervalMin + Math.floor(Math.random() * (settings.minigameIntervalMax - settings.minigameIntervalMin + 1)))

  useEffect(() => {
    // Use a timeout to avoid synchronous state update in effect warning
    const timeoutId = setTimeout(() => {
      const card = cards[currentIndex];
      if (card) {
        let probDeEn = 0;
        if (card.box === 1) probDeEn = 0;
        else if (card.box === 2) probDeEn = 0.5;
        else if (card.box >= 3 && card.box <= 6) probDeEn = 0.8;
        else probDeEn = 1;

        const isGapText = Math.random() > 0.5 && !!card.gapText;
        setShowGapText(isGapText);
        setAskDirection(Math.random() < probDeEn ? 'de-en' : 'en-de');
      }
    }, 0)
    return () => clearTimeout(timeoutId)
  }, [currentIndex, cards.length, cards])

  const handleAnswer = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    const card = cards[currentIndex]


    // Optimistic state update
    if (rating !== 'again') {
      setStats(s => ({ ...s, correct: s.correct + 1 }))
    } else {
      setStats(s => ({ ...s, incorrect: s.incorrect + 1 }))
    }

    // Minigame logic
    const newCount = sessionCardCount + 1;
    setSessionCardCount(newCount);



    if (settings.minigamesEnabled && newCount >= nextMinigameThreshold) {
      setShowMinigame(true);
      setSessionCardCount(0);
      setNextMinigameThreshold(settings.minigameIntervalMin + Math.floor(Math.random() * (settings.minigameIntervalMax - settings.minigameIntervalMin + 1)));
    }


    try {
      await updateCardProgress(card.id, (deck.id === 'global' && card.deckId) ? card.deckId : deck.id, rating)
    } catch (e) {
      console.error("Failed to update progress", e)
    }


    setIsFlipped(false)
    setTimeout(async () => {
      if (currentIndex + 1 < cards.length) {
        setCurrentIndex(curr => curr + 1)
        // state will be updated by useEffect
      } else {
        setSessionCompleted(true)
        // Session complete, save results
        try {
          const finalCorrect = rating !== 'again' ? stats.correct + 1 : stats.correct;
          const finalIncorrect = rating === 'again' ? stats.incorrect + 1 : stats.incorrect;
          if (!isGlobal) await saveDeckResult(deck.id, finalCorrect, finalIncorrect);
        } catch (e) {
          console.error("Failed to save session result", e);
        }
      }
      setIsTransitioning(false);
    }, 400) // Wait for flip animation to mostly finish
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (sessionCompleted) return

    if (e.key === ' ' || e.key === 'Enter') {
      // Allow input field to handle its own enter/space
      if (!isFlipped && isTypingMode && document.activeElement?.tagName === 'INPUT') {
        return; // Let input handle typing
      }

      e.preventDefault()
      if (!isFlipped && !isTypingMode) {
        setIsFlipped(true)
      } else if (isFlipped && typingFeedback) {
        handleAnswer(typingFeedback.rating);
        setTypingInput('');
        setTypingFeedback(null);
      }
    } else if (isFlipped && !typingFeedback) {
      if (e.key === '1') {
        handleAnswer('again')
      } else if (e.key === '2') {
        handleAnswer('hard')
      } else if (e.key === '3') {
        handleAnswer('good')
      } else if (e.key === '4') {
        handleAnswer('easy')
      }
    }
  }


  const playAudio = (text: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  }

  useEffect(() => {
    // Give the DOM a tiny bit of time to settle, also ensuring it's not called too aggressively
    const timeoutId = setTimeout(() => {
      if (!sessionCompleted && cards[currentIndex] && !isTransitioning) {
        // Autoplay on front only if asking en-de
        const isEq = askDirection === 'en-de' && !showGapText;
        if (!isFlipped && isEq) {
          playAudio(cards[currentIndex].front);
        }
        // Autoplay on back if asking de-en (since they just revealed the English word)
        if (isFlipped && !isEq) {
          playAudio(cards[currentIndex].front);
        }
      }
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [currentIndex, sessionCompleted, cards, isFlipped, askDirection, showGapText, isTransitioning]);

  if (sessionCompleted) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 max-w-md w-full shadow-xl">
          <div className="w-16 h-16 bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-zinc-100">Session beendet!</h2>
          <p className="text-zinc-500 dark:text-zinc-400 mb-8">Du hast alle fälligen Karten gelernt.</p>


          {(stats.correct > 0 || stats.incorrect > 0) && (
            <div className="flex justify-center gap-8 mb-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 dark:text-green-400 mb-1">{stats.correct}</div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">Gewusst</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-1">{stats.incorrect}</div>
                <div className="text-sm text-zinc-500 dark:text-zinc-400">Nicht gewusst</div>
              </div>
            </div>
          )}

          {stats.correct === 0 && stats.incorrect === 0 && deck.lastResultCorrect !== undefined && deck.lastResultCorrect !== null && (
            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4 mb-8">
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4 font-medium">Dein letztes Ergebnis:</p>
              <div className="flex justify-center gap-8">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400 mb-1">{deck.lastResultCorrect}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Gewusst</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400 mb-1">{deck.lastResultIncorrect}</div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400">Nicht gewusst</div>
                </div>
              </div>
            </div>
          )}

<button
            onClick={() => {
              const allCards = [...deck.cards];
              for (let i = allCards.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allCards[i], allCards[j]] = [allCards[j], allCards[i]];
              }
              if (isGlobal) {
                window.location.href = '/study';
              } else {
                setCards(allCards)
                setCurrentIndex(0)
                setStats({ correct: 0, incorrect: 0 })
                setSessionCompleted(deck.cards.length === 0)
              }
            }}
            className="block w-full py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors mb-3 flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" /> Session wiederholen
          </button>
          <Link
            href={isGlobal ? '/' : `/decks/${deck.id}`}
            className="block w-full py-3 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            {isGlobal ? "Zurück zur Startseite" : "Zurück zum Deck"}
          </Link>
        </div>
      </div>
    )
  }

  const currentCard = cards[currentIndex]
  const progress = ((currentIndex) / cards.length) * 100

  const questionText = showGapText && currentCard?.gapText ? currentCard.gapText : (askDirection === 'de-en' ? currentCard?.back : currentCard?.front);
  const subtitleText = showGapText && currentCard?.gapText ? `Lückentext (Hinweis: ${currentCard.back})` : (askDirection === 'de-en' ? "Übersetze ins Englische" : "Übersetze ins Deutsche");
  const isEnglishQuestion = askDirection === 'en-de' && !showGapText;

  const isTypingMode = studyMode === 'smart' && currentCard?.box >= 4;
  const correctAnswer = !isEnglishQuestion ? currentCard?.front : currentCard?.back;

  const handleTypingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!typingInput.trim()) return;

    const result = evaluateAnswer(typingInput, correctAnswer);

    let rating: 'again' | 'hard' | 'good' | 'easy' = 'again';
    if (result.status === 'CORRECT') rating = 'good';
    else if (result.status === 'TYPO') rating = 'hard';
    else rating = 'again';

    setTypingFeedback({ ...result, rating });
    setIsFlipped(true);
  };

  return (
    <>
      {showMinigame && (
        <MinigameOverlay
          onClose={() => setShowMinigame(false)}
          settings={settings}
          pool={deck.cards}
        />
      )}
      <div
        className="flex-1 flex flex-col items-center p-4 md:p-8 outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      autoFocus
    >
      <header className="w-full max-w-3xl flex justify-between items-center mb-8">
        <div className="flex-1">
          <Link href={isGlobal ? '/' : `/decks/${deck.id}`} className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-block">
            <ArrowLeft className="w-6 h-6" />
          </Link>
        </div>
        <div className="text-sm font-medium text-zinc-500 flex-1 text-center">
          Karte {currentIndex + 1} von {cards.length}
        </div>
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => setStudyMode(m => m === 'smart' ? 'classic' : 'smart')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition-colors"
            title={studyMode === 'smart' ? 'Smart-Modus aktiv (Tippen ab Box 4)' : 'Klassisch aktiv (Immer umdrehen)'}
          >
            {studyMode === 'smart' ? <Keyboard className="w-4 h-4" /> : <Type className="w-4 h-4" />}
            {studyMode === 'smart' ? 'Smart' : 'Klassisch'}
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="w-full max-w-3xl h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden mb-12">
        <div
          className="h-full bg-blue-500 transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Card area */}
      <div
        className="relative w-full max-w-2xl perspective-1000 cursor-pointer"
        onClick={() => !isFlipped && !isTypingMode && setIsFlipped(true)}
      >
        <div
          className={`w-full relative transition-all duration-500 transform-style-3d ${isFlipped ? 'rotate-x-180' : ''} grid`}
        >
          {/* Spacer to enforce minimum aspect ratio */}
          <div className="col-start-1 row-start-1 w-full aspect-video md:aspect-[3/2] pointer-events-none invisible" />

          {/* Front */}
          <div className="col-start-1 row-start-1 backface-hidden bg-white dark:bg-zinc-900 rounded-3xl shadow-lg border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center py-20 px-8 md:py-24 md:px-12 text-center h-full">
            {isEnglishQuestion && (
              <button
                onClick={(e) => playAudio(currentCard.front, e)}
                className="absolute top-6 left-6 p-3 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 transition-colors"
                title="Aussprache anhören"
              >
                <Volume2 className="w-6 h-6" />
              </button>
            )}

            {/* Leech-Management: Mnemonic hint for problem cards */}
            {currentCard.lapses >= 3 && currentCard.mnemonic && (
              <div className="absolute top-6 right-6">
                <span className="inline-block bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-xl text-sm font-medium border border-orange-200 dark:border-orange-800/50 shadow-sm">
                  💡 {currentCard.mnemonic}
                </span>
              </div>
            )}

            <span className="text-3xl md:text-5xl font-bold text-zinc-900 dark:text-zinc-100 [overflow-wrap:anywhere] w-full">{questionText}</span>
            <span className="mt-4 text-sm text-blue-500 font-medium">{subtitleText}</span>
            {isTypingMode ? (
              <form onSubmit={handleTypingSubmit} className="w-full mt-8 relative" onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={typingInput}
                  onChange={e => setTypingInput(e.target.value)}
                  placeholder="Antwort eintippen..."
                  className="w-full px-6 py-4 pr-16 rounded-xl border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xl text-center focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all"
                  autoFocus
                  autoCorrect="off"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoComplete="off"
                />
                <button
                  type="submit"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center"
                  title="Absenden"
                >
                  <ArrowLeft className="w-5 h-5 rotate-180" />
                </button>
              </form>
            ) : (
              <div className="absolute bottom-8 text-sm text-zinc-400 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Klicken oder Leertaste zum Umdrehen
              </div>
            )}
          </div>

          {/* Back */}
          <div className="col-start-1 row-start-1 backface-hidden rotate-x-180 bg-white dark:bg-zinc-900 rounded-3xl shadow-lg border border-zinc-200 dark:border-zinc-800 flex flex-col items-center justify-center py-20 px-8 md:py-24 md:px-12 text-center h-full">
            <button
              onClick={(e) => playAudio(currentCard.front, e)}
              className="absolute top-6 left-6 p-3 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-blue-600 transition-colors"
              title="Aussprache anhören"
            >
              <Volume2 className="w-6 h-6" />
            </button>
            <span className="text-2xl md:text-3xl font-medium text-zinc-500 mb-2 [overflow-wrap:anywhere] w-full">{!isEnglishQuestion ? currentCard.back : currentCard.front}</span>
            <span className="text-3xl md:text-5xl font-bold text-blue-600 dark:text-blue-500 mb-6 [overflow-wrap:anywhere] w-full">{!isEnglishQuestion ? currentCard.front : currentCard.back}</span>
            {currentCard.gapText && (
               <div className="text-md text-zinc-500 mb-4 italic [overflow-wrap:anywhere] w-full">
                 {currentCard.gapText.replace('___', currentCard.front)}
               </div>
            )}
            {currentCard.notes && (
              <div className="text-lg md:text-xl text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-4 rounded-xl [overflow-wrap:anywhere] w-full">
                {currentCard.notes}
              </div>
            )}

            {typingFeedback && (
              <div className={`mt-6 p-4 rounded-xl w-full font-medium ${
                typingFeedback.status === 'CORRECT' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                typingFeedback.status === 'TYPO' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}>
                {typingFeedback.message}
              </div>
            )}

            {/* Box badge */}
            <div className="absolute top-6 right-6">
              <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                Box {currentCard.box}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className={`mt-12 flex gap-2 transition-all duration-300 ${isFlipped ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
        {typingFeedback ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAnswer(typingFeedback.rating);
              setTypingInput('');
              setTypingFeedback(null);
            }}
            className="w-full max-w-sm mx-auto py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg hover:bg-blue-700 active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
          >
            Weiter <ArrowLeft className="w-5 h-5 rotate-180" />
          </button>
        ) : (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); handleAnswer('again'); }}
              className="flex flex-col items-center gap-2"
            >
          <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-sm">
            <X className="w-8 h-8" />
          </div>
          <span className="text-xs font-medium text-zinc-500">Erneut (1)</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleAnswer('hard'); }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-sm">
            <Brain className="w-8 h-8" />
          </div>
          <span className="text-xs font-medium text-zinc-500">Schwer (2)</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleAnswer('good'); }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-sm">
            <Check className="w-8 h-8" />
          </div>
          <span className="text-xs font-medium text-zinc-500">Gut (3)</span>
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleAnswer('easy'); }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-500 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform shadow-sm">
            <Zap className="w-8 h-8" />
          </div>
          <span className="text-xs font-medium text-zinc-500">Einfach (4)</span>
        </button>
          </>
        )}
      </div>

        </div>
    </>
  )
}
