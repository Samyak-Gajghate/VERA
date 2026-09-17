"use client";

import React, { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/apiConfig";
import {
  Activity,
  BarChart2,
  PieChart as PieIcon,
  ShieldAlert,
  RotateCcw,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface AnalyticsData {
  summary: {
    total_queries: number;
    avg_confidence: number;
    hallucination_rate: number;
    avg_retries: number;
    retry_rate: number;
  };
  daily_volume: Array<{ date: string; queries: number }>;
  confidence_dist: Array<{ range: string; count: number }>;
  retry_dist: Array<{ label: string; value: number }>;
  top_sources: Array<{ source: string; query_count: number }>;
  recent_queries: Array<{
    id: string;
    question: string;
    confidence: number;
    retry_count: number;
    hallucination: boolean;
    created_at: string;
  }>;
}

const COLORS = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"];

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/analytics`);
        if (!res.ok) throw new Error("Failed to fetch analytics");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <span className="ml-3 text-sm font-medium">Loading telemetry dashboard...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-500 mb-3" />
        <h2 className="text-lg font-bold text-slate-200">Unable to load analytics</h2>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          {error || "Make sure the VERA backend API is running on port 8000."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 lg:p-8 space-y-6 max-w-7xl mx-auto w-full overflow-y-auto">
      <header>
        <h1 className="text-2xl font-bold text-slate-100">Telemetry & Analytics Dashboard</h1>
        <p className="text-xs text-slate-400 mt-1">
          Aggregated system performance metrics, confidence calibration, and hallucination telemetry over the last 30 days.
        </p>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Queries</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-100">{data.summary.total_queries}</p>
          <p className="text-[10px] text-slate-400">Total queries processed</p>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Avg Confidence</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-100">
            {(data.summary.avg_confidence * 100).toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-400">Answer calibration score</p>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Hallucination Rate</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-100">{data.summary.hallucination_rate}%</p>
          <p className="text-[10px] text-slate-400">Flagged by auditor pass</p>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Avg Rewrites</span>
            <RotateCcw className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-100">{data.summary.avg_retries}</p>
          <p className="text-[10px] text-slate-400">Query rewrites per query</p>
        </div>

        <div className="glass-card p-4 rounded-2xl border border-slate-800 space-y-1 col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Rewrite Rate</span>
            <RotateCcw className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-100">{data.summary.retry_rate}%</p>
          <p className="text-[10px] text-slate-400">Queries needing rewrite</p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Query Volume */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Query Volume (30 Days)
            </h3>
            <BarChart2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="h-56">
            {data.daily_volume.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                No volume data logged yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.daily_volume}>
                  <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      borderColor: "#1e293b",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="queries" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Confidence Score Distribution */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Confidence Calibration Distribution
            </h3>
            <BarChart2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.confidence_dist}>
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderColor: "#1e293b",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top Source Documents & Recent Log Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Sources */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Top Retrieved Documents
            </h3>
          </div>
          <div className="space-y-2">
            {data.top_sources.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No source retrieval logs yet</p>
            ) : (
              data.top_sources.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 bg-slate-900/60 rounded-xl border border-slate-800/80 text-xs"
                >
                  <span className="font-mono text-slate-300 truncate max-w-[200px]">
                    {item.source}
                  </span>
                  <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-semibold text-[10px]">
                    {item.query_count} queries
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Queries Log Table */}
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Recent Query Activity Log
              </h3>
            </div>
            <span className="text-[10px] text-slate-500">Last 20 executions</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2 px-3">Question</th>
                  <th className="py-2 px-3">Confidence</th>
                  <th className="py-2 px-3">Rewrites</th>
                  <th className="py-2 px-3">Hallucination</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {data.recent_queries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-500 text-xs">
                      No query activity recorded yet
                    </td>
                  </tr>
                ) : (
                  data.recent_queries.map((q) => (
                    <tr key={q.id} className="hover:bg-slate-900/40">
                      <td className="py-2.5 px-3 font-medium text-slate-200 max-w-xs truncate">
                        {q.question}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            q.confidence >= 0.7
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {(q.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400">{q.retry_count}</td>
                      <td className="py-2.5 px-3">
                        {q.hallucination ? (
                          <span className="px-2 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded text-[10px] font-semibold">
                            Flagged
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-[10px] font-semibold">
                            Clean
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
