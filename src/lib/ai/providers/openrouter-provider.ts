import { AiGenerateOptions, IAiProvider } from "../ai-provider.interface"
import { QuotaExceededError } from "@/lib/services/gemini-executor"

export const DEFAULT_OPENROUTER_MODEL = "google/gemini-2.5-flash"

function cleanJsonText(rawText: string): string {
  let cleaned = rawText.trim()
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json\s*/, "")
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```\s*/, "")
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.replace(/\s*```$/, "")
  }
  return cleaned.trim()
}

export class OpenRouterProvider implements IAiProvider {
  id = "openrouter" as const
  name = "OpenRouter"

  constructor(private apiKey: string, private defaultModel: string = DEFAULT_OPENROUTER_MODEL) {}

  async generateStructuredJson<T>(options: AiGenerateOptions): Promise<T> {
    const model = options.model || this.defaultModel
    const messages: Array<{ role: string; content: any }> = []

    if (options.image) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: options.prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${options.image.mimeType};base64,${options.image.data}`,
            },
          },
        ],
      })
    } else {
      messages.push({
        role: "user",
        content: options.prompt,
      })
    }

    const payload: Record<string, any> = {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      response_format: { type: "json_object" },
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "HTTP-Referer": process.env.RENDER_EXTERNAL_URL || "https://github.com/Le0nB2/vokabeltrainer",
        "X-Title": "N30 Vokabeltrainer",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errBody = await response.text().catch(() => "")
      if (response.status === 429) {
        throw new QuotaExceededError(
          "Dein OpenRouter-Kontingent ist für diesen Zeitraum aufgebraucht oder das Rate-Limit wurde erreicht."
        )
      }
      if (response.status === 401) {
        throw new Error("Ungültiger OpenRouter API-Schlüssel oder abgelaufenes Token.")
      }
      throw new Error(`OpenRouter API Fehler (${response.status}): ${errBody}`)
    }

    const data = await response.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error("Keine Antwort von OpenRouter erhalten.")
    }

    const cleaned = cleanJsonText(content)
    try {
      const parsed = JSON.parse(cleaned)
      if (!Array.isArray(parsed) && typeof parsed === "object" && parsed !== null) {
        if ((options.prompt.includes("Liste") || options.prompt.includes("Array") || options.prompt.includes("cards") || options.prompt.includes("Karten")) && !options.jsonSchema) {
          const arrayKey = Object.keys(parsed).find((k) => Array.isArray(parsed[k]))
          if (arrayKey) {
            return parsed[arrayKey] as T
          }
        }
      }
      return parsed as T
    } catch (parseErr: any) {
      throw new Error(`Fehler beim Parsen der JSON-Antwort von OpenRouter: ${parseErr?.message}`)
    }
  }
}
