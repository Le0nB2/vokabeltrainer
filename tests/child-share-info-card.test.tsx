import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChildShareInfoCard } from '@/components/ChildShareInfoCard'

describe('ChildShareInfoCard Component', () => {
  const mockOnFinish = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      share: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('renders child info, credentials and PWA homescreen instructions', () => {
    render(
      <ChildShareInfoCard
        childName="Mia"
        childUsername="mia"
        onFinish={mockOnFinish}
      />
    )

    expect(screen.getByText('Fast geschafft! So legt Mia los 🎉')).toBeDefined()
    expect(screen.getByText('mia')).toBeDefined()
    expect(screen.getByText(/Teile das Kennwort deinem Kind persönlich mit/)).toBeDefined()
    expect(screen.getByText(/iPhone & iPad \(Safari\)/)).toBeDefined()
    expect(screen.getByText(/Android \(Google Chrome\)/)).toBeDefined()
    expect(screen.getByText('Infos an Kind teilen')).toBeDefined()
    expect(screen.getByText('Text kopieren')).toBeDefined()
  })

  it('copies share text to clipboard when clicking "Text kopieren"', async () => {
    render(
      <ChildShareInfoCard
        childName="Mia"
        childUsername="mia"
        onFinish={mockOnFinish}
      />
    )

    fireEvent.click(screen.getByText('Text kopieren'))

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Hallo Mia!')
      )
      expect(screen.getByText('Text kopiert!')).toBeDefined()
    })
  })

  it('uses navigator.share when clicking "Infos an Kind teilen"', async () => {
    render(
      <ChildShareInfoCard
        childName="Felix"
        childUsername="felix"
        onFinish={mockOnFinish}
      />
    )

    fireEvent.click(screen.getByText('Infos an Kind teilen'))

    await waitFor(() => {
      expect(navigator.share).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Felix'),
          text: expect.stringContaining('felix'),
        })
      )
    })
  })

  it('calls onFinish when clicking "Weiter zum Trainer"', () => {
    render(
      <ChildShareInfoCard
        childName="Felix"
        childUsername="felix"
        onFinish={mockOnFinish}
      />
    )

    fireEvent.click(screen.getByText('Weiter zum Trainer'))
    expect(mockOnFinish).toHaveBeenCalledTimes(1)
  })
})
