import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  isOpenAiSuitableModel,
  getOpenAiModelTier,
  formatOpenAiDisplayName,
  getStoredOpenAiModels,
  fetchAndPersistOpenAiModels,
  STATIC_OPENAI_MODELS,
} from "@/lib/services/openai-models"
import prisma from "@/lib/prisma"

describe("openai-models service", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("classifies suitable vs unsuitable models correctly", () => {
    expect(isOpenAiSuitableModel("gpt-4o-mini")).toBe(true)
    expect(isOpenAiSuitableModel("chatgpt-4o-latest")).toBe(true)
    expect(isOpenAiSuitableModel("gpt-4o")).toBe(true)
    expect(isOpenAiSuitableModel("o3-mini")).toBe(true)
    expect(isOpenAiSuitableModel("o1")).toBe(true)

    // Unsuitable / dated snapshots
    expect(isOpenAiSuitableModel("gpt-4o-2024-08-06")).toBe(false)
    expect(isOpenAiSuitableModel("text-embedding-3-small")).toBe(false)
    expect(isOpenAiSuitableModel("whisper-1")).toBe(false)
    expect(isOpenAiSuitableModel("dall-e-3")).toBe(false)
    expect(isOpenAiSuitableModel("tts-1")).toBe(false)
    expect(isOpenAiSuitableModel("gpt-4o-realtime-preview")).toBe(false)
  })

  it("determines model tiers accurately", () => {
    expect(getOpenAiModelTier("gpt-4o-mini")).toBe("standard")
    expect(getOpenAiModelTier("gpt-4o")).toBe("flagship")
    expect(getOpenAiModelTier("chatgpt-4o-latest")).toBe("flagship")
    expect(getOpenAiModelTier("o3-mini")).toBe("reasoning")
    expect(getOpenAiModelTier("o1-preview")).toBe("reasoning")
  })

  it("formats display names properly", () => {
    expect(formatOpenAiDisplayName("gpt-4o-mini")).toBe("GPT-4o Mini")
    expect(formatOpenAiDisplayName("chatgpt-4o-latest")).toBe("ChatGPT-4o Latest (Dauer-Aktuell)")
    expect(formatOpenAiDisplayName("o3-mini")).toBe("o3-mini")
    expect(formatOpenAiDisplayName("gpt-4o")).toBe("GPT-4o")
  })

  it("returns default static models when no models in DB", async () => {
    vi.spyOn(prisma.aiModel, "findMany").mockResolvedValue([])
    const models = await getStoredOpenAiModels()
    expect(models).toEqual(STATIC_OPENAI_MODELS)
  })

  it("fetches and persists models from OpenAI API", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "gpt-4o-mini" },
          { id: "chatgpt-4o-latest" },
          { id: "o3-mini" },
          { id: "gpt-4o" },
          { id: "text-embedding-ada-002" },
        ],
      }),
    })
    global.fetch = mockFetch as any

    const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 })
    const createMock = vi.fn().mockResolvedValue({})

    vi.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
      return callback({
        aiModel: {
          deleteMany: deleteManyMock,
          create: createMock,
        },
      })
    })

    const res = await fetchAndPersistOpenAiModels("sk-proj-test-key")
    expect(res.success).toBe(true)
    expect(res.count).toBe(4) // 4 suitable models (embedding filtered out)
    expect(deleteManyMock).toHaveBeenCalledWith({ where: { provider: "openai" } })
    expect(createMock).toHaveBeenCalledTimes(4)
  })
})
