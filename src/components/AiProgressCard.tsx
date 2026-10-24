"use client";

import React, { useEffect, useState } from "react";
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  FileCheck2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
} from "lucide-react";
import { AiStatusMessage, AiStage } from "@/lib/services/ai-status";

export interface StepItem {
  id: string;
  label: string;
}

interface AiProgressCardProps {
  title: string;
  currentStatus: AiStatusMessage | null;
  statusHistory: AiStatusMessage[];
  steps?: StepItem[];
  activeStepIndex?: number;
}

export function AiProgressCard({
  title,
  currentStatus,
  statusHistory,
  steps,
  activeStepIndex = 1,
}: AiProgressCardProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Elapsed timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer for retrying state
  useEffect(() => {
    if (currentStatus?.stage === "retrying" && currentStatus.delaySeconds) {
      setRetryCountdown(currentStatus.delaySeconds);
      const interval = setInterval(() => {
        setRetryCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setRetryCountdown(null);
    }
  }, [currentStatus]);

  const stage = currentStatus?.stage || "init";
  const message = currentStatus?.message || "Vorbereitung...";

  // Render status banner based on stage
  const renderStatusBanner = () => {
    switch (stage) {
      case "retrying":
        return (
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl p-4 text-amber-900 dark:text-amber-200 transition-all animate-pulse">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/60 rounded-lg text-amber-600 dark:text-amber-300 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold text-sm">
                    Modell vorübergehend überlastet (503)
                  </h4>
                  {retryCountdown !== null && retryCountdown > 0 && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-100">
                      in {retryCountdown}s
                    </span>
                  )}
                </div>
                <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-1 leading-relaxed">
                  {message}
                </p>
                {currentStatus?.attempt && currentStatus?.maxAttempts && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {Array.from({ length: currentStatus.maxAttempts }).map((_, i) => (
                      <div
                        key={i}
                        className={`h-1.5 flex-1 rounded-full transition-colors ${
                          i < (currentStatus.attempt || 1)
                            ? "bg-amber-500"
                            : "bg-amber-200 dark:bg-amber-800"
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "fallback":
        return (
          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-700/60 rounded-xl p-4 text-purple-900 dark:text-purple-200 transition-all">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/60 rounded-lg text-purple-600 dark:text-purple-300 shrink-0">
                <RefreshCw className="w-5 h-5 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm">Wechsle zum Fallback-Modell</h4>
                <p className="text-xs text-purple-800/90 dark:text-purple-300/90 mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
        );

      case "optimizing":
        return (
          <div className="bg-teal-50 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700/60 rounded-xl p-4 text-teal-900 dark:text-teal-200 transition-all">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-teal-100 dark:bg-teal-900/60 rounded-lg text-teal-600 dark:text-teal-300 shrink-0">
                <FileCheck2 className="w-5 h-5 animate-bounce" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm">Druck-Optimierung</h4>
                <p className="text-xs text-teal-800/90 dark:text-teal-300/90 mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
        );

      case "generating":
      default:
        return (
          <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/50 rounded-xl p-4 text-blue-900 dark:text-blue-200 transition-all">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/60 rounded-lg text-blue-600 dark:text-blue-300 shrink-0">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-sm">KI-Generierung läuft</h4>
                  {currentStatus?.model && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {currentStatus.model}
                    </span>
                  )}
                </div>
                <p className="text-xs text-blue-800/90 dark:text-blue-300/90 mt-1 leading-relaxed">
                  {message}
                </p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="max-w-lg w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="font-bold text-lg text-zinc-900 dark:text-zinc-100 leading-tight">
              {title}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Bitte kurz warten, die KI arbeitet im Hintergrund
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 rounded-full font-mono">
          <Clock className="w-3.5 h-3.5" />
          <span>{elapsedSeconds}s</span>
        </div>
      </div>

      {/* Stepper Progress */}
      {steps && steps.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {steps.map((step, idx) => {
              const isCompleted = idx < activeStepIndex;
              const isCurrent = idx === activeStepIndex;

              return (
                <div
                  key={step.id}
                  className={`flex flex-col items-center text-center p-2 rounded-lg border text-xs transition-all ${
                    isCompleted
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : isCurrent
                      ? "border-blue-400 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200 font-semibold shadow-xs"
                      : "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-500"
                  }`}
                >
                  <div className="mb-1">
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    ) : isCurrent ? (
                      stage === "retrying" ? (
                        <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                      )
                    ) : (
                      <span className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-[10px]">
                        {idx + 1}
                      </span>
                    )}
                  </div>
                  <span className="truncate w-full">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Current Status Box */}
      {renderStatusBanner()}

      {/* Activity Log (Collapsible) */}
      {statusHistory.length > 0 && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
          >
            <span>Aktivitäten ({statusHistory.length})</span>
            {showHistory ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showHistory && (
            <div className="mt-2.5 max-h-40 overflow-y-auto space-y-1.5 text-[11px] font-mono bg-zinc-50 dark:bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800">
              {statusHistory.map((item, index) => {
                const date = new Date(item.timestamp);
                const timeStr = date.toTimeString().split(" ")[0];
                return (
                  <div
                    key={index}
                    className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400"
                  >
                    <span className="text-zinc-400 shrink-0">[{timeStr}]</span>
                    <span className="break-all">{item.message}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
