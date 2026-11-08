import { describe, it, expect, vi, beforeEach } from "vitest"
import { OpenRouterProvider } from "@/lib/ai/providers/openrouter-provider"
import { OpenAiProvider } from "@/lib/ai/providers/openai-provider"
import { GeminiProvider } from "@/lib/ai/providers/gemini-provider"
import { getActiveAiProvider } from "@/lib/ai/ai-router"
import { encryptSecret } from "@/lib/security/crypto"
import prisma from "@/lib/prisma"

describe("AI Providers & Router", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe("OpenRouterProvider", () => {
    it("sends structured JSON request to OpenRouter API and parses response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ result: "success", items: ["apple", "banana"] }),
              },
            },
          ],
        }),
      })
      global.fetch = mockFetch as any

      const provider = new OpenRouterProvider("sk-or-test-key")
      const res = await provider.generateStructuredJson<{ result: string; items: string[] }>({
        prompt: "Gib Vokabeln zurück",
      })

      expect(res.result).toBe("success")
      expect(res.items).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://openrouter.ai/api/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-or-test-key",
          }),
        })
      )
    })

    it("handles image vision OCR requests in OpenRouter format", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "```json\n[{\"front\": \"dog\", \"back\": \"Hund\"}]\n```",
              },
            },
          ],
        }),
      })
      global.fetch = mockFetch as any

      const provider = new OpenRouterProvider("sk-or-test-key")
      const res = await provider.generateStructuredJson<Array<{ front: string; back: string }>>({
        prompt: "Scanne Bild",
        image: { data: "base64data", mimeType: "image/jpeg" },
      })

      expect(res).toEqual([{ front: "dog", back: "Hund" }])
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(requestBody.messages[0].content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "image_url" }),
        ])
      )
    })

    it("throws QuotaExceededError on HTTP 429", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      })
      global.fetch = mockFetch as any

      const provider = new OpenRouterProvider("sk-or-test-key")
      await expect(
        provider.generateStructuredJson({ prompt: "Test" })
      ).rejects.toThrow("OpenRouter-Kontingent ist für diesen Zeitraum aufgebraucht")
    })
  })

  describe("getActiveAiProvider", () => {
    it("returns OpenRouter when activeAiProvider is set to openrouter and key exists", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValue({
        id: "default",
        activeAiProvider: "openrouter",
      } as any)

      vi.spyOn(prisma.userAiCredential, "findFirst").mockResolvedValue({
        id: "cred-1",
        provider: "openrouter_key",
        apiKey: encryptSecret("sk-or-v1-my-secret"),
      } as any)

      const config = await getActiveAiProvider()
      expect(config.providerId).toBe("openrouter")
      expect(config.provider.name).toBe("OpenRouter")
    })

    it("returns Gemini when activeAiProvider is gemini and credential exists", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValue({
        id: "default",
        activeAiProvider: "gemini",
      } as any)

      vi.spyOn(prisma.userAiCredential, "findFirst").mockResolvedValue({
        id: "cred-2",
        provider: "gemini_key",
        apiKey: encryptSecret("AIzaSyTestKey"),
      } as any)

      const config = await getActiveAiProvider()
      expect(config.providerId).toBe("gemini")
      expect(config.provider.name).toBe("Google Gemini")
    })

    it("returns OpenAI when activeAiProvider is openai and credential exists", async () => {
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValue({
        id: "default",
        activeAiProvider: "openai",
      } as any)

      vi.spyOn(prisma.userAiCredential, "findFirst").mockResolvedValue({
        id: "cred-3",
        provider: "openai_key",
        apiKey: encryptSecret("sk-proj-test-key"),
      } as any)

      const config = await getActiveAiProvider()
      expect(config.providerId).toBe("openai")
      expect(config.provider.name).toBe("ChatGPT (OpenAI)")
    })
  })

  describe("OpenAiProvider", () => {
    it("sends structured JSON request to OpenAI API and parses response", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({ result: "success", items: ["hello", "world"] }),
              },
            },
          ],
        }),
      })
      global.fetch = mockFetch as any

      const provider = new OpenAiProvider("sk-proj-test-key")
      const res = await provider.generateStructuredJson<{ result: string; items: string[] }>({
        prompt: "Gib Vokabeln zurück",
      })

      expect(res.result).toBe("success")
      expect(res.items).toHaveLength(2)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer sk-proj-test-key",
          }),
        })
      )
    })

    it("handles image OCR requests in OpenAI vision format", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "[{\"front\": \"cat\", \"back\": \"Katze\"}]",
              },
            },
          ],
        }),
      })
      global.fetch = mockFetch as any

      const provider = new OpenAiProvider("sk-proj-test-key")
      const res = await provider.generateStructuredJson<Array<{ front: string; back: string }>>({
        prompt: "Scanne Bild",
        image: { data: "base64data", mimeType: "image/png" },
      })

      expect(res).toEqual([{ front: "cat", back: "Katze" }])
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(requestBody.messages[0].content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "image_url" }),
        ])
      )
    })

    it("throws QuotaExceededError on HTTP 429", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Insufficient quota",
      })
      global.fetch = mockFetch as any

      const provider = new OpenAiProvider("sk-proj-test-key")
      await expect(
        provider.generateStructuredJson({ prompt: "Test" })
      ).rejects.toThrow("Dein OpenAI/ChatGPT-Guthaben ist aufgebraucht")
    })
  })

  describe("getActiveAiProvider with multiple Gemini keys", () => {
    it("splits comma-separated Gemini keys into individual keys in GeminiProvider", async () => {
      delete process.env.GEMINI_API_KEYS
      delete process.env.GEMINI_API_KEY
      vi.spyOn(prisma.settings, "findUnique").mockResolvedValue({
        id: "default",
        activeAiProvider: "gemini",
      } as any)
      vi.spyOn(prisma.userAiCredential, "findFirst").mockResolvedValue({
        id: "cred-1",
        userId: null,
        provider: "gemini_key",
        apiKey: encryptSecret("AIzaSyKeyOne111, AIzaSyKeyTwo222"),
      } as any)

      const config = await getActiveAiProvider()
      expect(config.providerId).toBe("gemini")
      const geminiProvider = config.provider as GeminiProvider
      expect(geminiProvider.apiKeys).toEqual(["AIzaSyKeyOne111", "AIzaSyKeyTwo222"])
    })
  })
})
