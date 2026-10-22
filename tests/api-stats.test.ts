import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import prisma from "@/lib/prisma";
import { getApiStats } from "@/actions/api-stats";
import { AUTH_COOKIE_NAME, createAppSessionToken, getAppSecret } from "@/lib/auth-utils";

describe("getApiStats action", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTH_USER = "admin";
    process.env.AUTH_PASSWORD = "password123";
    delete process.env.AUTH_SECRET;
    const user = "admin";
    const pass = "password123";
    const secret = getAppSecret(pass);
    const token = createAppSessionToken(user, secret, 3600);
    if (!globalThis.__mockCookies) {
      globalThis.__mockCookies = new Map();
    }
    globalThis.__mockCookies.set(AUTH_COOKIE_NAME, { value: token });
  });

  afterEach(() => {
    process.env = originalEnv;
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

    if (!prisma.apiUsageLog) {
      (prisma as any).apiUsageLog = {
        findMany: vi.fn().mockResolvedValue(mockLogs),
      };
    } else if (vi.isMockFunction(prisma.apiUsageLog.findMany)) {
      (prisma.apiUsageLog.findMany as any).mockResolvedValue(mockLogs);
    } else {
      (vi.spyOn(prisma.apiUsageLog, "findMany") as any).mockResolvedValue(mockLogs);
    }

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

  it("handles database query errors gracefully by returning empty array", async () => {
    if (!prisma.apiUsageLog) {
      (prisma as any).apiUsageLog = {
        findMany: vi.fn().mockRejectedValue(new Error("DB error")),
      };
    } else if (vi.isMockFunction(prisma.apiUsageLog.findMany)) {
      (prisma.apiUsageLog.findMany as any).mockRejectedValue(new Error("DB error"));
    } else {
      (vi.spyOn(prisma.apiUsageLog, "findMany") as any).mockRejectedValue(new Error("DB error"));
    }

    const stats = await getApiStats();
    expect(stats).toEqual([]);
  });
});
