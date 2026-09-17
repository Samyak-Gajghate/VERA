"use client";

import { useState, useCallback, useRef } from "react";
import { SSEEvent, StepType } from "@repo/types";
import { getApiBaseUrl } from "@/lib/apiConfig";

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  confidence?: number;
  sources?: Array<{ source: string; grade: string; source_type?: "document" | "web" }>;
  steps?: SSEEvent[];
  isStreaming?: boolean;
  queryId?: string;
}

export function useRAGStream() {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [activeSteps, setActiveSteps] = useState<SSEEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const askQuestion = useCallback(
    async (question: string) => {
      if (!question.trim() || isStreaming) return;

      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;
      const userTimestamp = new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

      const userMessage: ChatMessageItem = {
        id: userMsgId,
        role: "user",
        content: question,
        timestamp: userTimestamp,
      };

      const initialAssistantMessage: ChatMessageItem = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        timestamp: userTimestamp,
        isStreaming: true,
        steps: [],
      };

      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      setActiveSteps([]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/ask`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question,
            session_id: sessionId,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;

            const jsonStr = trimmed.slice(6);
            try {
              const event: SSEEvent = JSON.parse(jsonStr);

              if (event.session_id && !sessionId) {
                setSessionId(event.session_id);
              }

              if (event.type === "final") {
                const finalData = event.data as any;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          content: finalData?.answer || "Unable to retrieve answer.",
                          confidence: finalData?.confidence ?? 0.0,
                          sources: finalData?.sources || [],
                          queryId: event.query_id,
                          isStreaming: false,
                        }
                      : msg
                  )
                );
              } else if (event.type === "error") {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          content: `Error: ${event.message}`,
                          isStreaming: false,
                        }
                      : msg
                  )
                );
              } else {
                setActiveSteps((prev) => [...prev, event]);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          steps: [...(msg.steps || []), event],
                        }
                      : msg
                  )
                );
              }
            } catch (err) {
              console.error("Error parsing SSE JSON:", err);
            }
          }
        }
      } catch (error: any) {
        if (error.name !== "AbortError") {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? {
                    ...msg,
                    content: `Error connecting to VERA service: ${error.message}`,
                    isStreaming: false,
                  }
                : msg
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isStreaming, sessionId]
  );

  return {
    messages,
    activeSteps,
    isStreaming,
    sessionId,
    askQuestion,
  };
}
