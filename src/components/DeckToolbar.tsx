"use client"

import { useState } from "react"
import { Plus, Camera, FileUp, Search, Trash2, Pencil } from "lucide-react"
import { AddCardModal } from "./AddCardModal"
import { EditCardModal } from "./EditCardModal"
import { CsvImportModal } from "./CsvImportModal"
import { PhotoScanModal } from "./PhotoScanModal"
import { deleteCard } from "@/actions/cards"

type CardType = {
  id: string
  front: string
  back: string
  notes?: string | null
  box: number
  dueDate: Date
  gapText?: string | null
  mnemonic?: string | null
  contextSentence?: string | null
}

export function DeckToolbar({ deck }: { deck: { id: string, cards: CardType[] } }) {
  const [showAddModal, setShowAddModal] = useState(false)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [cardToEdit, setCardToEdit] = useState<CardType | null>(null)

  const [search, setSearch] = useState("")
  const [boxFilter, setBoxFilter] = useState("all") // "all" or "1"-"7"

  const filteredCards = deck.cards.filter((c: CardType) => {
    const matchesSearch = c.front.toLowerCase().includes(search.toLowerCase()) || c.back.toLowerCase().includes(search.toLowerCase())
    const matchesBox = boxFilter === "all" ? true : c.box.toString() === boxFilter
    return matchesSearch && matchesBox
  })

  return (
    <div>
      <div className="bg-white dark:bg-zinc-900 rounded-xl p-4 shadow-sm border border-zinc-200 dark:border-zinc-800 mb-6 flex flex-col md:flex-row gap-4 justify-between">

        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Manuell
          </button>
          <button onClick={() => setShowCsvModal(true)} className="flex items-center gap-2 px-3 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors">
            <FileUp className="w-4 h-4" /> CSV
          </button>
          <button onClick={() => setShowPhotoModal(true)} className="flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:opacity-90 rounded-lg text-sm font-medium transition-opacity">
            <Camera className="w-4 h-4" /> Foto-Scan
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Suchen..."
              className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full md:w-48 dark:bg-zinc-900 dark:border-zinc-800"
            />
          </div>
          <select
            value={boxFilter}
            onChange={e => setBoxFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm dark:bg-zinc-900 dark:border-zinc-800"
          >
            <option value="all">Alle Stufen</option>
            {[1,2,3,4,5,6,7].map(n => <option key={n} value={n}>Stufe {n}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-sm min-w-[800px]">
          <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <tr>
              <th className="p-4 font-medium">Stufe</th>
              <th className="p-4 font-medium">Vorderseite</th>
              <th className="p-4 font-medium">Rückseite</th>
              <th className="p-4 font-medium">Lückentext</th>
              <th className="p-4 font-medium">Eselsbrücke</th>
              <th className="p-4 font-medium">Beispielsatz</th>
              <th className="p-4 font-medium">Fällig am</th>
              <th className="p-4 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredCards.length > 0 ? filteredCards.map((card: CardType) => (
              <tr key={card.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/20 transition-colors">
                <td className="p-4">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${card.box === 7 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                    {card.box}
                  </span>
                </td>
                <td className="p-4 font-medium">{card.front}</td>
                <td className="p-4 text-zinc-600 dark:text-zinc-300">
                  {card.back}
                  {card.notes && <div className="text-xs text-zinc-400 mt-1">{card.notes}</div>}
                </td>
                <td className="p-4 text-zinc-600 dark:text-zinc-300 italic">
                  {card.gapText || "-"}
                </td>
                <td className="p-4 text-zinc-600 dark:text-zinc-300">
                  {card.mnemonic || "-"}
                </td>
                <td className="p-4 text-zinc-600 dark:text-zinc-300">
                  {card.contextSentence || "-"}
                </td>
                <td className="p-4 text-zinc-500">
                  {new Date(card.dueDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                </td>
                <td className="p-4">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setCardToEdit(card)}
                      className="text-zinc-400 hover:text-blue-500 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={async () => await deleteCard(card.id, deck.id)}
                      className="text-zinc-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={8} className="p-8 text-center text-zinc-500">
                  Keine Karten gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AddCardModal deckId={deck.id} isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
      <CsvImportModal deckId={deck.id} isOpen={showCsvModal} onClose={() => setShowCsvModal(false)} />
      <PhotoScanModal deckId={deck.id} isOpen={showPhotoModal} onClose={() => setShowPhotoModal(false)} />
      <EditCardModal
        deckId={deck.id}
        card={cardToEdit}
        isOpen={!!cardToEdit}
        onClose={() => setCardToEdit(null)}
      />
    </div>
  )
}
