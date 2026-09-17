"use client";

import React, { useState } from "react";
import { ChatMessageItem } from "../hooks/useRAGStream";
import { User, Bot, FileText, Globe, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle } from "lucide-react";

interface ChatMessageProps {
  message: ChatMessageItem;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-3 text-sm ${isUser ? "justify-end" : "justify-start"} group`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0 border border-blue-400/20">
          <Bot className="w-4 h-4" />
        </div>
      )}

      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-lg transition-all ${
          isUser
            ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-br-none"
            : "glass-panel border border-slate-800 text-slate-200 rounded-bl-none"
        }`}
      >
        <div className="flex items-center justify-between gap-4 mb-1.5 pb-1 border-b border-white/5">
          <span className="text-[11px] font-bold tracking-wider uppercase opacity-75">
            {isUser ? "You" : "VERA Agent"}
          </span>
          <span className="text-[10px] opacity-60 font-mono">{message.timestamp}</span>
        </div>

        {/* Message body */}
        <div className="leading-relaxed whitespace-pre-wrap font-normal">
          {message.content ? (
            message.content
          ) : message.isStreaming ? (
            <span className="inline-flex items-center gap-1.5 text-blue-400 font-medium text-xs py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Reasoning & searching context...
            </span>
          ) : (
            <span className="text-slate-400 italic">No output</span>
          )}
        </div>

        {/* Assistant Footer: Confidence Score & Sources */}
        {!isUser && !message.isStreaming && (message.confidence !== undefined || (message.sources && message.sources.length > 0)) && (
          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              {message.confidence !== undefined && (
                <div
                  className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    message.confidence >= 0.7
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : message.confidence >= 0.4
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                      : "bg-rose-500/10 text-rose-400 border-rose-500/20"
                  }`}
                >
                  {message.confidence >= 0.7 ? (
                    <ShieldCheck className="w-3 h-3" />
                  ) : (
                    <AlertTriangle className="w-3 h-3" />
                  )}
                  <span>Confidence: {(message.confidence * 100).toFixed(0)}%</span>
                </div>
              )}
            </div>

            {message.steps && message.steps.length > 0 && (
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
              >
                <span>{showDetails ? "Hide trace" : "View reasoning"}</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            )}

            {/* Sources list */}
            {message.sources && message.sources.length > 0 && (
              <div className="w-full mt-2 pt-2 border-t border-slate-800/60">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                  <FileText className="w-3 h-3 text-blue-400" />
                  <span>Attributed Sources</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {message.sources.map((src, i) => {
                    const isWeb = src.source_type === "web";
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono ${
                          isWeb
                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                            : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                        }`}
                      >
                        {isWeb ? <Globe className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                        <span>{src.source}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Inline expandable trace */}
            {showDetails && message.steps && (
              <div className="w-full mt-2 p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-xs space-y-2 max-h-48 overflow-y-auto">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Execution Trace ({message.steps.length} events)
                </p>
                {message.steps.map((st, i) => (
                  <div key={i} className="text-[11px] text-slate-300 font-mono">
                    <span className="text-blue-400 font-semibold">{st.type}</span>: {st.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
}
