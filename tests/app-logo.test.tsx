import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { AppLogo, AppLogoIcon } from "@/components/AppLogo"

describe("AppLogo & AppLogoIcon component", () => {
  it("renders AppLogo with N30 and Vokabeltrainer brand text", () => {
    const { container } = render(<AppLogo />)

    expect(screen.getByText("N30")).toBeDefined()
    expect(screen.getByText("Vokabeltrainer")).toBeDefined()

    // Verify dark mode readability class for N30
    const n30 = screen.getByText("N30")
    expect(n30.className).toContain("text-slate-900")
    expect(n30.className).toContain("dark:text-slate-100")

    // Verify blue color classes for Vokabeltrainer
    const vokabeltrainer = screen.getByText("Vokabeltrainer")
    expect(vokabeltrainer.className).toContain("text-blue-600")
    expect(vokabeltrainer.className).toContain("dark:text-blue-500")

    // Verify Lucide Book-Open SVG contains the spine line
    const spineLine = container.querySelector('line[x1="12"][y1="5"][x2="12"][y2="21"]')
    expect(spineLine).not.toBeNull()
  })

  it("renders as semantic h1 heading when asHeading is true", () => {
    render(<AppLogo asHeading size="lg" />)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).toBeDefined()
    expect(heading.textContent).toContain("N30")
    expect(heading.textContent).toContain("Vokabeltrainer")
  })

  it("supports different sizes (sm, md, lg)", () => {
    const { rerender } = render(<AppLogo size="sm" />)
    expect(screen.getByText("N30").parentElement?.className).toContain("text-lg")

    rerender(<AppLogo size="md" />)
    expect(screen.getByText("N30").parentElement?.className).toContain("text-xl")

    rerender(<AppLogo size="lg" />)
    expect(screen.getByText("N30").parentElement?.className).toContain("text-2xl")
  })

  it("renders icon-only when showText is false", () => {
    const { container } = render(<AppLogo showText={false} />)
    expect(screen.queryByText("N30")).toBeNull()
    expect(screen.queryByText("Vokabeltrainer")).toBeNull()
    expect(container.querySelector("svg")).not.toBeNull()
  })

  it("renders AppLogoIcon standalone with customizable className", () => {
    const { container } = render(<AppLogoIcon className="w-10 h-10 custom-class" />)
    const svg = container.querySelector("svg")
    expect(svg?.getAttribute("class")).toContain("custom-class")
    expect(svg?.getAttribute("class")).toContain("w-10")
  })
})
