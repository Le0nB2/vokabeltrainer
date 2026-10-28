import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UserManagementSettings } from '../src/components/UserManagementSettings'
import * as authActions from '../src/actions/auth'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}))

describe('UserManagementSettings Einstellungs-PIN', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Einstellungs-PIN button for admin users and updates PIN', async () => {
    vi.spyOn(authActions, 'updateSettingsPasswordAction').mockResolvedValue({ success: true })

    const initialData = {
      hasPrimaryAdmin: true,
      primaryAdminType: 'db' as const,
      isEnvConfigured: false,
      users: [
        {
          id: 'admin-1',
          username: 'eltern',
          displayName: 'Eltern',
          role: 'ADMIN' as const,
          isActive: true,
          isEnvUser: false,
          isPrimaryAdmin: true,
          createdAt: new Date(),
          deckCount: 2,
        },
        {
          id: 'child-1',
          username: 'leon',
          displayName: 'Leon',
          role: 'USER' as const,
          isActive: true,
          isEnvUser: false,
          isPrimaryAdmin: false,
          createdAt: new Date(),
          deckCount: 1,
        },
      ],
    }

    render(<UserManagementSettings initialData={initialData} isSettingsProtected={true} />)

    // Button should be visible for admin
    const pinBtn = screen.getByTitle('PIN für Einstellungen ändern')
    expect(pinBtn).toBeDefined()

    // Click button to open modal
    fireEvent.click(pinBtn)

    expect(screen.getByText('Einstellungs-PIN verwalten')).toBeDefined()

    const pinInput = screen.getByPlaceholderText('Mindestens 4 Zeichen (z. B. 1234)')
    const pinConfirmInput = screen.getByPlaceholderText('PIN wiederholen')

    fireEvent.change(pinInput, { target: { value: '9999' } })
    fireEvent.change(pinConfirmInput, { target: { value: '9999' } })

    fireEvent.click(screen.getByText('PIN speichern'))

    await waitFor(() => {
      expect(authActions.updateSettingsPasswordAction).toHaveBeenCalledWith({
        action: 'change',
        newPassword: '9999',
      })
    })
  })

  it('renders Einstellungs-PIN button in single-user mode', async () => {
    const initialData = {
      hasPrimaryAdmin: false,
      primaryAdminType: null,
      isEnvConfigured: false,
      users: [],
    }

    render(<UserManagementSettings initialData={initialData} isSettingsProtected={false} />)

    expect(screen.getByText('Einzelnutzer-Modus aktiv')).toBeDefined()
    expect(screen.getByText('Einstellungs-PIN festlegen')).toBeDefined()
  })
})
