"use client";

import React from "react";
import { SSEEvent } from "@repo/types";
import {
  Activity,
  Database,
  CheckSquare,
  RefreshCw,
  Globe,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface AuditTrailProps {
  steps: SSEEvent[];
  isStreaming?: boolean;
}

const STEP_ICONS: Record<string, React.ReactNode> = {
  start: <Activity className="w-4 h-4 text-blue-400" />,
  retrieve: <Database className="w-4 h-4 text-cyan-400" />,
  grade: <CheckSquare className="w-4 h-4 text-amber-400" />,
  rewrite: <RefreshCw className="w-4 h-4 text-purple-400 animate-spin-slow" />,
  web_search: <Globe className="w-4 h-4 text-emerald-400 animate-pulse" />,
  generate: <Sparkles className="w-4 h-4 text-indigo-400" />,
  hallucination_check: <ShieldCheck className="w-4 h-4 text-emerald-400" />,
  final: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  error: <AlertCircle className="w-4 h-4 text-rose-500" />,
};

export function AuditTrail({ steps, isStreaming }: AuditTrailProps) {
  if (!steps || steps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 glass-card rounded-2xl border border-slate-800">
        <Activity className="w-8 h-8 mb-3 text-slate-600 animate-pulse" />
        <p className="text-xs font-medium">No active reasoning trace</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
          Ask a question to view real-time vector retrieval, query rewrites, web search fallbacks, and hallucination checks.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <h3 className="text-xs font-bold tracking-wider uppercase text-slate-300">
            Live Reasoning Trace
          </h3>
        </div>
        {isStreaming && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20 glow-active">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
            Executing
          </span>
        )}
      </div>

      <div className="relative pl-4 border-l-2 border-slate-800 space-y-4">
        {steps.map((step, idx) => {
          const icon = STEP_ICONS[step.type] || <Activity className="w-4 h-4 text-slate-400" />;
          const isWebSearchStep = step.type === "web_search";

          return (
            <div key={idx} className="relative group">
              {/* Dot marker */}
              <div className="absolute -left-[21px] top-0.5 p-1 bg-slate-950 rounded-full border border-slate-800 group-hover:border-blue-500/50 transition-colors">
                {icon}
              </div>

              <div
                className={`p-3 glass-card rounded-xl border transition-all space-y-1.5 ${
                  isWebSearchStep
                    ? "border-emerald-500/30 bg-emerald-950/20"
                    : "border-slate-800/80 hover:border-slate-700/80"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span
                    className={`font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1 ${
                      isWebSearchStep ? "text-emerald-400 font-bold" : "text-slate-200"
                    }`}
                  >
                    {isWebSearchStep && <Globe className="w-3 h-3 text-emerald-400" />}
                    {step.type.replace("_", " ")}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {step.timestamp
                      ? new Date(step.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })
                      : ""}
                  </span>
                </div>

                <p className="text-xs text-slate-300 font-medium leading-relaxed">
                  {step.message}
                </p>

                {step.data && Object.keys(step.data).length > 0 && (
                  <div className="mt-2 p-2 bg-slate-950/60 rounded-lg border border-slate-800/60 text-[11px] font-mono text-slate-400 overflow-x-auto">
                    <pre className="whitespace-pre-wrap leading-tight">
                      {JSON.stringify(step.data, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
