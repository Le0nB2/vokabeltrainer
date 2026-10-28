import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { ImportExport } from '@/components/ImportExport'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

vi.mock('@/actions/settings', () => ({
  importData: vi.fn(),
}))

describe('ImportExport Component (SEC-07 export behavior)', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock URL.createObjectURL and URL.revokeObjectURL
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:http://localhost/test-blob')
    global.URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    cleanup()
    global.fetch = originalFetch
  })

  it('renders export and import buttons correctly', () => {
    render(<ImportExport />)
    expect(screen.getByText('Daten Exportieren')).toBeDefined()
    expect(screen.getByRole('button', { name: /Exportieren \(JSON\)/i })).toBeDefined()
    expect(screen.getByText('Daten Importieren')).toBeDefined()
  })

  it('successfully triggers export download when clicking export button', async () => {
    const mockBlob = new Blob(['{"version":2}'], { type: 'application/json' })
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: vi.fn().mockResolvedValue(mockBlob),
    })

    render(<ImportExport />)
    const exportButton = screen.getByRole('button', { name: /Exportieren \(JSON\)/i })
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/export', { method: 'POST' })
      expect(global.URL.createObjectURL).toHaveBeenCalled()
      expect(screen.getByText('Export erfolgreich heruntergeladen!')).toBeDefined()
    })
  })

  it('displays error message when export returns 401 unauthorized', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: 'Unauthorized' }),
    })

    render(<ImportExport />)
    const exportButton = screen.getByRole('button', { name: /Exportieren \(JSON\)/i })
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/export', { method: 'POST' })
      expect(screen.getByText('Nicht autorisiert. Bitte melde dich an.')).toBeDefined()
    })
  })

  it('displays generic error message on export failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    })

    render(<ImportExport />)
    const exportButton = screen.getByRole('button', { name: /Exportieren \(JSON\)/i })
    fireEvent.click(exportButton)

    await waitFor(() => {
      expect(screen.getByText('Export fehlgeschlagen.')).toBeDefined()
    })
  })

  it('opens mapping dialog when backup contains an unknown owner and availableUsers does not have it', async () => {
    const backupJson = JSON.stringify({
      version: 2,
      decks: [
        {
          title: 'Englisch Deck',
          ownerUsername: 'anna',
          cards: [{ front: 'dog', back: 'Hund' }],
        },
      ],
    })

    const file = new File([backupJson], 'backup.json', { type: 'application/json' })

    const availableUsers = [
      { id: 'u-1', username: 'eltern', displayName: 'Eltern', role: 'ADMIN' },
      { id: 'u-2', username: 'leon', displayName: 'Leon', role: 'USER' },
    ]

    render(<ImportExport availableUsers={availableUsers} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('Profile in der Sicherung zuordnen')).toBeDefined()
      expect(screen.getByText(/Profil "anna"/i)).toBeDefined()
      expect(screen.getByText('Als neues Kinder-Profil anlegen (Empfohlen)')).toBeDefined()
    })
  })
})
