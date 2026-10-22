import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/prisma";
import { getApiStats } from "@/actions/api-stats";

vi.mock("@/lib/auth-guard", () => ({
  requireAppAuth: vi.fn().mockResolvedValue(true),
}));

describe("getApiStats action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("aggregates success and error counts including errorBreakdown", async () => {
    const mockLogs = [
      {
        id: "log-1",
        apiKeyIndex: 1,
        isSuccess: true,
        endpoint: "enrich-csv",
        errorReason: null,
        createdAt: new Date(),
      },
      {
        id: "log-2",
        apiKeyIndex: 1,
        isSuccess: false,
        endpoint: "enrich-csv",
        errorReason: "overloaded",
        createdAt: new Date(),
      },
      {
        id: "log-3",
        apiKeyIndex: 1,
        isSuccess: false,
        endpoint: "enrich-csv",
        errorReason: "quota",
        createdAt: new Date(),
      },
    ];

    vi.spyOn(prisma.apiUsageLog, "findMany").mockResolvedValue(mockLogs as any);

    const stats = await getApiStats();
    expect(stats.length).toBeGreaterThan(0);

    const todayStats = stats[stats.length - 1];
    expect(todayStats.keyIndex).toBe(1);
    expect(todayStats.successCount).toBe(1);
    expect(todayStats.errorCount).toBe(2);
    expect(todayStats.errorBreakdown).toEqual({
      overloaded: 1,
      quota: 1,
      other: 0,
    });
  });
});
