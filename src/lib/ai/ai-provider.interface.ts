export interface AiImageInput {
  data: string // base64 encoded string
  mimeType: string // e.g. "image/jpeg", "image/png", "image/webp"
}

export interface AiGenerateOptions {
  prompt: string
  image?: AiImageInput
  jsonSchema?: Record<string, any>
  temperature?: number
  model?: string
}

export interface IAiProvider {
  id: "gemini" | "openrouter" | "openai"
  name: string
  generateStructuredJson<T>(options: AiGenerateOptions): Promise<T>
}
