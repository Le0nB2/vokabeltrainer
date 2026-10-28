import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SetupWizard } from '../src/components/SetupWizard'
import * as setupActions from '../src/actions/setup'

const mockPush = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}))

describe('SetupWizard Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates from mode selection to step 2 (Eltern-Konto), and then to step 3 (Kinder-Konto)', async () => {
    vi.spyOn(setupActions, 'completeSetupProtected').mockResolvedValue({ success: true })

    render(<SetupWizard isPublicOrRender={false} />)

    // Step 1: Mode Selection
    expect(screen.getByText('Geschützter Modus')).toBeDefined()
    expect(screen.getByText('Einzelnutzer-Modus')).toBeDefined()

    // Click "Geschützt einrichten"
    fireEvent.click(screen.getByText('Geschützt einrichten'))

    // Step 2: Eltern-Konto & Kindersicherung
    expect(screen.getByText('Schritt 1 von 2: Eltern-Konto')).toBeDefined()
    expect(screen.getByText('1. Eltern- / Administrator-Konto')).toBeDefined()

    // Fill parent credentials
    const usernameInput = screen.getByPlaceholderText('z. B. Papa, Mama oder Admin')
    const passInput = screen.getByPlaceholderText('Mind. 8 Zeichen & 1 Sonderzeichen')
    const confirmPassInput = screen.getByPlaceholderText('Passwort wiederholen')

    fireEvent.change(usernameInput, { target: { value: 'eltern' } })
    fireEvent.change(passInput, { target: { value: 'ParentPass123!' } })
    fireEvent.change(confirmPassInput, { target: { value: 'ParentPass123!' } })

    // Click "Weiter: Kinder-Konto einrichten"
    fireEvent.click(screen.getByText('Weiter: Kinder-Konto einrichten'))

    // Step 3: Kinder-Konto Nachfrage
    await waitFor(() => {
      expect(screen.getByText('Schritt 2 von 2: Kinder-Konto')).toBeDefined()
      expect(screen.getByText('Möchtest du direkt ein Kinder-Konto einrichten?')).toBeDefined()
      expect(screen.getByText('Ja, jetzt ein Kinder-Konto anlegen')).toBeDefined()
      expect(screen.getByText('Nein, erst später in den Einstellungen anlegen')).toBeDefined()
    })

    // Fill child credentials
    const childDisplayNameInput = screen.getByPlaceholderText('z. B. Leon oder Anna')
    fireEvent.change(childDisplayNameInput, { target: { value: 'Leon' } })

    const childPassInput = screen.getByPlaceholderText('Mind. 8 Zeichen & 1 Sonderzeichen')
    const childConfirmPassInput = screen.getByPlaceholderText('Passwort wiederholen')

    fireEvent.change(childPassInput, { target: { value: 'ChildPass123!' } })
    fireEvent.change(childConfirmPassInput, { target: { value: 'ChildPass123!' } })

    // Click "Einrichtung abschließen 🚀"
    fireEvent.click(screen.getByText('Einrichtung abschließen 🚀'))

    await waitFor(() => {
      expect(setupActions.completeSetupProtected).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'eltern',
          password: 'ParentPass123!',
          createChild: true,
          childAccount: expect.objectContaining({
            displayName: 'Leon',
            username: 'leon',
            password: 'ChildPass123!',
          }),
        })
      )
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('allows opting out of child account creation on step 3', async () => {
    vi.spyOn(setupActions, 'completeSetupProtected').mockResolvedValue({ success: true })

    render(<SetupWizard isPublicOrRender={false} />)

    fireEvent.click(screen.getByText('Geschützt einrichten'))

    // Fill parent credentials
    fireEvent.change(screen.getByPlaceholderText('z. B. Papa, Mama oder Admin'), { target: { value: 'eltern' } })
    fireEvent.change(screen.getByPlaceholderText('Mind. 8 Zeichen & 1 Sonderzeichen'), { target: { value: 'ParentPass123!' } })
    fireEvent.change(screen.getByPlaceholderText('Passwort wiederholen'), { target: { value: 'ParentPass123!' } })

    fireEvent.click(screen.getByText('Weiter: Kinder-Konto einrichten'))

    await waitFor(() => {
      expect(screen.getByText('Möchtest du direkt ein Kinder-Konto einrichten?')).toBeDefined()
    })

    // Select "Nein, erst später anlegen"
    fireEvent.click(screen.getByText('Nein, erst später in den Einstellungen anlegen'))

    // Submit setup
    fireEvent.click(screen.getByText('Einrichtung abschließen 🚀'))

    await waitFor(() => {
      expect(setupActions.completeSetupProtected).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'eltern',
          password: 'ParentPass123!',
          createChild: false,
          childAccount: undefined,
        })
      )
    })
  })
})
