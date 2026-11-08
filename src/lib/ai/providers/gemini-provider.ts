import { AiGenerateOptions, IAiProvider } from "../ai-provider.interface"
import { callGeminiWithRetry } from "@/lib/services/gemini-executor"

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

export class GeminiProvider implements IAiProvider {
  id = "gemini" as const
  name = "Google Gemini"

  constructor(private apiKeys: string[]) {}

  async generateStructuredJson<T>(options: AiGenerateOptions): Promise<T> {
    return callGeminiWithRetry({
      endpoint: "ai-provider",
      apiKeys: this.apiKeys,
      models: options.model ? [options.model] : undefined,
      execute: async (ai, modelToUse) => {
        const contents: any[] = [options.prompt]

        if (options.image) {
          contents.push({
            inlineData: {
              data: options.image.data,
              mimeType: options.image.mimeType,
            },
          })
        }

        const config: Record<string, any> = {
          responseMimeType: "application/json",
          temperature: options.temperature ?? 0.2,
        }

        if (options.jsonSchema) {
          config.responseJsonSchema = options.jsonSchema
        }

        const response = await ai.models.generateContent({
          model: modelToUse,
          contents,
          config,
        })

        const textResponse = response.text
        if (!textResponse) {
          throw new Error("Failed to generate text from Gemini")
        }

        const cleaned = cleanJsonText(textResponse)
        return JSON.parse(cleaned) as T
      },
    })
  }
}
