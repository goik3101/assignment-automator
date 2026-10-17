"use client";

import { useCallback, useRef, useState } from "react";
import type { SourceRef } from "@/types/task";
import type { PreparedImage } from "@/lib/ui/image";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  /** 사용자가 붙인 사진 미리보기(화면용). */
  imageUrl?: string;
}

export type ChatContextRef = { kind: "history" | "learning" | "submission"; id: string } | null;

let counter = 0;
const nextId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;

/** 질문을 /api/chat으로 보내고 대화 상태를 들고 있는 훅. */
export function useChat(initialContext: ChatContextRef = null) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ChatContextRef>(initialContext);
  const imageRef = useRef<PreparedImage | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string, image?: PreparedImage | null) => {
      const content = text.trim();
      if (!content || busy) return;
      setError(null);
      if (image) imageRef.current = image;
      const userMsg: ChatMessage = { id: nextId(), role: "user", content, imageUrl: image?.previewUrl };
      const history = [...messages, userMsg];
      setMessages(history);
      setBusy(true);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
            // 대화에 붙인 안내문 사진은 매번 함께 보낸다(모델이 항상 같은 안내문을 기준으로 답하도록).
            image: imageRef.current ? { base64: imageRef.current.base64, mimeType: imageRef.current.mimeType } : undefined,
            context: context ?? undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((data as { error?: string }).error ?? "답변을 받지 못했어요.");
        const { reply, sources } = data as { reply: string; sources?: SourceRef[] };
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: reply, sources }]);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.");
      } finally {
        setBusy(false);
      }
    },
    [busy, messages, context]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setError(null);
    setBusy(false);
    imageRef.current = null;
  }, []);

  return { messages, busy, error, context, setContext, send, reset };
}
