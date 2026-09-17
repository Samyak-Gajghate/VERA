"use client";

import React, { useState, useRef } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getApiBaseUrl } from "@/lib/apiConfig";

export function UploadButton() {
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setStatusMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Upload failed");
      }

      setStatusMessage({
        type: "success",
        text: `Uploaded "${data.source}" (${data.chunks_inserted} chunks)`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: "error",
        text: err.message || "File upload failed",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <div className="relative inline-block">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.txt,.md"
        className="hidden"
        id="doc-upload-input"
      />
      <button
        id="upload-doc-button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isUploading}
        className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-md hover:shadow-blue-500/25 transition-all disabled:opacity-50"
      >
        {isUploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
        <span>{isUploading ? "Ingesting..." : "Upload Doc"}</span>
      </button>

      {statusMessage && (
        <div
          className={`absolute right-0 top-12 z-50 flex items-center gap-2 px-3 py-2 text-xs rounded-lg shadow-xl border backdrop-blur-md animate-fade-in ${
            statusMessage.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/80 border-rose-500/30 text-rose-300"
          }`}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="truncate max-w-xs">{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
}
