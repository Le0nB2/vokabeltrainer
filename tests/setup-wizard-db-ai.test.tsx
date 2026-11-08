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

  it('shows database setup step when initialDatabaseNeedsSetup is true', async () => {
    render(<SetupWizard isPublicOrRender={true} isRender={true} initialDatabaseNeedsSetup={true} />)

    expect(screen.getByText('Datenbank auswählen & verbinden')).toBeDefined()
    expect(screen.getByText('Neon Cloud-Datenbank (PostgreSQL)')).toBeDefined()
    expect(screen.getByText('Render-Cloud erkannt:')).toBeDefined()
  })

  it('preselects Neon and tests connection on submit', async () => {
    vi.spyOn(dbActions, 'testAndMigrateDatabase').mockResolvedValue({
      success: true,
      message: 'Neon-Datenbank erfolgreich verbunden!',
    })

    render(<SetupWizard isPublicOrRender={true} isRender={true} initialDatabaseNeedsSetup={true} />)

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
})
