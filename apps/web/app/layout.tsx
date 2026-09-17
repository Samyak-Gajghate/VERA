import "./globals.css";
import React from "react";
import Link from "next/link";
import { UploadButton } from "../components/UploadButton";
import { ShieldCheck, BarChart2, MessageSquare } from "lucide-react";

export const metadata = {
  title: "VERA — Verified & Evaluated Retrieval Architecture",
  description:
    "Self-correcting, hallucination-resistant RAG system with real-time auditability.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#080c14] text-slate-100 antialiased selection:bg-blue-600 selection:text-white">
        {/* Header Navigation */}
        <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 px-4 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="text-base font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                  VERA
                </span>
                <span className="ml-2 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  CRAG + Self-RAG
                </span>
              </div>
            </Link>

            <nav className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                <span>Chat</span>
              </Link>
              <Link
                href="/analytics"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
              >
                <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Analytics</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <UploadButton />
          </div>
        </header>

        {/* Main Content Viewport */}
        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
