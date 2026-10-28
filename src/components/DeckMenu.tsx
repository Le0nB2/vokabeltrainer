"use client"

import { useState, useRef, useEffect } from "react"
import { MoreVertical, Edit, Trash2, FileText } from "lucide-react"
import Link from "next/link"
import { deleteDeck } from "@/actions/decks"

export function DeckMenu({ deckId, cardCount }: { deckId: string; cardCount: number }) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleDelete = async () => {
    if (window.confirm("Bist du sicher, dass du dieses Deck wirklich löschen möchtest? Alle enthaltenen Karten werden ebenfalls gelöscht.")) {
      await deleteDeck(deckId)
    }
    setIsOpen(false)
  }

  return (
    <div className="absolute top-4 right-4 z-10" ref={menuRef}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        title="Menü"
      >
        <MoreVertical className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-lg overflow-hidden py-1">
          {cardCount >= 5 && (
            <Link
              href={`/decks/${deckId}/worksheet`}
              target="_blank"
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
            >
              <FileText className="w-4 h-4" />
              Arbeitsblatt drucken
            </Link>
          )}
          <Link
            href={`/decks/${deckId}`}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
          >
            <Edit className="w-4 h-4" />
            Bearbeiten
          </Link>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              handleDelete()
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors text-left"
          >
            <Trash2 className="w-4 h-4" />
            Löschen
          </button>
        </div>
      )}
    </div>
  )
}
