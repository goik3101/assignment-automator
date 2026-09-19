"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnalyzeResult } from "@/types/task";
import { learningApi } from "./api";

function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, data] = (reader.result as string).split(",");
      resolve({ data, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Figma "새 창작물" 모달 구성(사진 넣기 / 사진 또는 주제 설명 / 상세 입력)을 따르되,
// 시작 버튼·진행 상태·오류 표시가 없던 부분을 채웠다. 분석은 기존 /api/tasks/analyze를
// 그대로 재사용한다(자동 작성 모드의 분석 로직은 건드리지 않는다).
export default function NewLearningModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [topicText, setTopicText] = useState("");
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const topicRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    topicRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function handleStart() {
    setError(null);
    setBusy(true);
    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (imageFile) {
        const encoded = await fileToBase64(imageFile);
        imageBase64 = encoded.data;
        imageMimeType = encoded.mimeType;
      }
      const analyzed = await learningApi<AnalyzeResult>("/api/tasks/analyze", {
        method: "POST",
        body: JSON.stringify({ imageBase64, imageMimeType, topicText, instructions }),
      });
      if (analyzed.insufficient_data) {
        throw new Error(
          analyzed.insufficient_reason ??
            "안내문에서 충분한 정보를 읽어내지 못했어요. 사진을 다시 올리거나 주제를 직접 적어주세요."
        );
      }
      const created = await learningApi<{ id: string }>("/api/learning/sessions", {
        method: "POST",
        body: JSON.stringify({
          subject: analyzed.subject,
          coreTaskInfo: analyzed.core_task_info,
          adminInfo: analyzed.administrative_info,
          instructions,
        }),
      });
      router.push(`/learning/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "시작하지 못했어요.");
      setBusy(false);
    }
  }

  const canStart = (!!imageFile || topicText.trim().length > 0) && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-learning-title"
        className="figma relative max-h-[92vh] w-full max-w-[640px] overflow-y-auto rounded-2xl border border-border !bg-surface px-8 py-7 shadow-2xl"
      >
        <button
          onClick={onClose}
          disabled={busy}
          aria-label="닫기"
          className="absolute right-4 top-4 rounded-md p-1 text-foreground/70 hover:text-foreground disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        <div className="flex flex-col items-center gap-5">
          <div className="flex flex-col items-center gap-3">
            <h2 id="new-learning-title" className="text-xl font-bold">
              사진 넣기
            </h2>
            <label className="flex h-[235px] w-[185px] cursor-pointer items-center justify-center border border-dashed border-foreground/70 transition-opacity hover:opacity-70">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="업로드한 안내문 미리보기" className="max-h-full max-w-full object-contain" />
              ) : (
                <svg viewBox="0 0 20 20" fill="none" className="h-14 w-14">
                  <path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
                </svg>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setImageFile(file);
                  setPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
            </label>
          </div>

          <div className="w-full">
            <label htmlFor="learning-topic" className="mb-2 block text-center text-xl font-bold">
              사진 넣기 또는 주제 설명
            </label>
            <input
              id="learning-topic"
              ref={topicRef}
              value={topicText}
              onChange={(e) => setTopicText(e.target.value)}
              placeholder="예: 인권 선구자의 업적 탐구 신문 만들기"
              className="w-full rounded-full border border-foreground/50 bg-transparent px-5 py-1.5 text-sm"
            />
          </div>

          <div className="w-full">
            <label htmlFor="learning-detail" className="mb-2 block text-center text-xl font-bold">
              상세 입력
            </label>
            <input
              id="learning-detail"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="예: 분량이나 형식, 선생님이 강조한 점 (선택)"
              className="w-full rounded-full border border-foreground/50 bg-transparent px-5 py-1.5 text-sm"
            />
          </div>

          {error && (
            <p role="alert" className="w-full rounded-xl border border-red-500/60 px-4 py-2 text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            onClick={handleStart}
            disabled={!canStart}
            className="rounded-full bg-accent px-10 py-2 text-sm font-bold text-accent-foreground disabled:opacity-40"
          >
            {busy ? "안내문을 분석하고 있어요..." : "분석하고 시작하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
