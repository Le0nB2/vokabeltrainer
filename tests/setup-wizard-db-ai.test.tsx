import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SetupWizard } from '@/components/SetupWizard'
import * as dbActions from '@/actions/setup-database'
import * as aiActions from '@/actions/ai-credentials'

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

describe('SetupWizard Database & AI Setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows welcome screen first when initialDatabaseNeedsSetup is true and hides SQLite under advanced when isRender is true', async () => {
    render(<SetupWizard isPublicOrRender={true} isRender={true} initialDatabaseNeedsSetup={true} />)

    // Welcome step appears first
    expect(screen.getByText('Lass uns loslegen! 🚀')).toBeDefined()
    expect(screen.getByText('Datenbank verbinden')).toBeDefined()
    expect(screen.getByText('Benutzerkonten & Kindersicherung')).toBeDefined()
    expect(screen.getByText('KI-Assistent anbinden')).toBeDefined()

    // Proceed to database setup
    fireEvent.click(screen.getByText('Einrichtung jetzt starten'))

    expect(screen.getByText('Datenbank auswählen & verbinden')).toBeDefined()
    expect(screen.getByText('Neon Cloud-Datenbank (PostgreSQL)')).toBeDefined()
    expect(screen.queryByText(/Render-Cloud erkannt/i)).toBeNull()
    expect(screen.getByText('Erweiterte Einstellungen')).toBeDefined()
    expect(screen.queryByText('Lokale Datei-Datenbank (SQLite)')).toBeNull()

    // Clicking "Erweiterte Einstellungen" reveals SQLite option
    fireEvent.click(screen.getByText('Erweiterte Einstellungen'))
    expect(screen.getByText('Lokale Datei-Datenbank (SQLite)')).toBeDefined()

    // Back button returns to welcome overview
    fireEvent.click(screen.getByText(/Zurück zur Einführung/i))
    expect(screen.getByText('Lass uns loslegen! 🚀')).toBeDefined()
  })

  it('preselects Neon and tests connection on submit', async () => {
    vi.spyOn(dbActions, 'testAndMigrateDatabase').mockResolvedValue({
      success: true,
      message: 'Neon-Datenbank erfolgreich verbunden!',
    })

    render(<SetupWizard isPublicOrRender={true} isRender={true} initialDatabaseNeedsSetup={true} initialStep={0} />)

    const input = screen.getByPlaceholderText(/postgresql:\/\/user:password@/i)
    fireEvent.change(input, {
      target: { value: 'postgresql://test:pass@ep-test.neon.tech/neondb' },
    })

    const submitBtn = screen.getByText(/Verbindung prüfen & initialisieren/i)
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText('Neon-Datenbank erfolgreich verbunden!')).toBeDefined()
      expect(screen.getByText(/Weiter zur Benutzereinrichtung/i)).toBeDefined()
    })
  })

  it('does NOT display option 3 (server-standard fallback) in the AI setup options', async () => {
    // Render setup wizard and check that Option 3 / server fallback is not offered
    render(<SetupWizard isPublicOrRender={false} initialDatabaseNeedsSetup={false} />)

    expect(screen.queryByText(/Server-Standard/i)).toBeNull()
    expect(screen.queryByText(/Option 3/i)).toBeNull()
  })

  it('hides single-user mode under advanced settings and marks protected mode as required when isRender is true', async () => {
    render(<SetupWizard isPublicOrRender={true} isRender={true} initialDatabaseNeedsSetup={false} initialStep={1} />)

    // Protected mode is shown with "Erforderlich"
    expect(screen.getByText('Geschützter Modus')).toBeDefined()
    expect(screen.getByText('Erforderlich')).toBeDefined()

    // Single-user mode is initially hidden
    expect(screen.queryByText('Einzelnutzer-Modus')).toBeNull()
    expect(screen.getByText('Erweiterte Einstellungen')).toBeDefined()

    // Expanding advanced settings reveals single-user mode
    fireEvent.click(screen.getByText('Erweiterte Einstellungen'))
    expect(screen.getByText('Einzelnutzer-Modus')).toBeDefined()
    expect(screen.getByText(/Trotzdem als Einzelnutzer starten/i)).toBeDefined()
  })

  it('shows both modes side-by-side with recommended badge when isRender is false', async () => {
    render(<SetupWizard isPublicOrRender={false} isRender={false} initialDatabaseNeedsSetup={false} initialStep={1} />)

    expect(screen.getByText('Geschützter Modus')).toBeDefined()
    expect(screen.getByText('Empfohlen')).toBeDefined()
    expect(screen.getByText('Einzelnutzer-Modus')).toBeDefined()
    expect(screen.getByText('Als Einzelnutzer starten')).toBeDefined()
    expect(screen.queryByText('Erweiterte Einstellungen')).toBeNull()
  })
})
