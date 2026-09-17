"use client";

import React, { useState } from "react";
import { useRAGStream } from "../hooks/useRAGStream";
import { ChatMessage } from "../components/ChatMessage";
import { AuditTrail } from "../components/AuditTrail";
import { Send, Sparkles, Shield, RefreshCw } from "lucide-react";

export default function ChatPage() {
  const [inputQuery, setInputQuery] = useState("");
  const { messages, activeSteps, isStreaming, askQuestion } = useRAGStream();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || isStreaming) return;
    askQuestion(inputQuery);
    setInputQuery("");
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-57px)] overflow-hidden">
      {/* Left Chat Area */}
      <section className="flex-1 flex flex-col bg-[#080c14] border-r border-slate-800/80">
        <header className="sr-only">
          <h1>VERA Interactive RAG Interface</h1>
        </header>

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto my-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600/20 to-indigo-600/20 border border-blue-500/30 flex items-center justify-center mb-4 text-blue-400">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">
                VERA RAG Engine
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                Ask questions against your ingested vector corpus. VERA automatically grades document relevance, rewrites unhelpful queries, and audits answers for factual hallucinations.
              </p>
              <div className="grid grid-cols-1 gap-2 w-full text-left">
                {[
                  "What is the self-attention mechanism in Transformers?",
                  "How does Retrieval-Augmented Generation improve accuracy?",
                  "What are the main components of the LangChain framework?",
                ].map((sample, i) => (
                  <button
                    key={i}
                    id={`sample-prompt-${i}`}
                    onClick={() => {
                      setInputQuery(sample);
                    }}
                    className="p-3 text-xs bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/40 rounded-xl text-slate-300 transition-all cursor-pointer"
                  >
                    "{sample}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)
          )}
        </div>

        {/* Input Bar */}
        <div className="p-4 glass-panel border-t border-slate-800/80">
          <form onSubmit={handleSubmit} className="flex gap-2 max-w-4xl mx-auto">
            <input
              id="chat-input-field"
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask a question about your documents..."
              disabled={isStreaming}
              className="flex-1 bg-slate-950/80 border border-slate-800 text-slate-100 placeholder:text-slate-500 text-xs sm:text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/40 transition-all disabled:opacity-50"
            />
            <button
              id="send-message-button"
              type="submit"
              disabled={!inputQuery.trim() || isStreaming}
              className="px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isStreaming ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </form>
        </div>
      </section>

      {/* Right Reasoning Audit Panel */}
      <aside className="w-full lg:w-[380px] xl:w-[420px] bg-[#0c101c] p-4 lg:p-6 overflow-y-auto border-t lg:border-t-0 lg:border-l border-slate-800/80 shrink-0">
        <AuditTrail steps={activeSteps} isStreaming={isStreaming} />
      </aside>
    </div>
  );
}
