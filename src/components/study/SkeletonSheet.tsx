"use client";

import { acronym, flowLine, segmentLine, type SkeletonBox } from "@/lib/study/memo-skeleton";
import { useT } from "@/lib/i18n";

/**
 * 암기 뼈대 한 장: 칸 순서 → 칸마다 한 줄(핵심어는 굵게) → 두음. 개념 이해 맨 아래와 암기 첫 화면이 같이 쓴다.
 * 시험장에서 꺼낼 것은 이 한 장이 전부이고, 문장은 이해한 대로 쓰면 된다.
 */
export default function SkeletonSheet({
  boxes,
  mnemonic,
  checked,
  onToggle,
  onlyUnchecked = false,
}: {
  boxes: SkeletonBox[];
  mnemonic: boolean;
  /** 있으면 칸마다 "외웠어요" 체크박스를 붙인다(칸 이름 기준). */
  checked?: Set<string>;
  onToggle?: (box: string) => void;
  /** true면 외운 칸은 숨긴다("못 외운 것만"). */
  onlyUnchecked?: boolean;
}) {
  const t = useT();
  return (
    <div>
      <p className="rounded-2xl bg-surface px-4 py-3 text-[14px] font-semibold leading-relaxed">
        <span className="mr-2 text-xs font-semibold text-faint">{t("쓰는 순서")}</span>
        {flowLine(boxes)}
      </p>
      <ol className="mt-3 divide-y divide-border rounded-xl border border-border">
        {boxes.map((b, i) => (
          onlyUnchecked && checked?.has(b.box) ? null : (
          <li key={i} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-center gap-2 text-xs font-semibold text-faint">
                {checked && onToggle && (
                  <input
                    type="checkbox"
                    checked={checked.has(b.box)}
                    onChange={() => onToggle(b.box)}
                    aria-label={t("외웠어요")}
                    className="h-4 w-4 cursor-pointer accent-foreground"
                  />
                )}
                <span>
                  {i + 1}. {b.box}
                </span>
              </p>
              {mnemonic && b.keywords.length >= 2 && (
                <span title={t("핵심어 첫 글자")} className="shrink-0 rounded-full bg-raised px-2.5 py-0.5 text-xs font-bold tracking-wide">
                  {acronym(b.keywords)}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-[15px] leading-[1.8]">
              {segmentLine(b.line, b.keywords).map((s, j) =>
                s.blank === undefined ? (
                  <span key={j} className="text-muted">
                    {s.text}
                  </span>
                ) : (
                  <b key={j} className="rounded bg-foreground/10 px-1 font-bold">
                    {s.text}
                  </b>
                )
              )}
            </p>
          </li>
          )
        ))}
      </ol>
    </div>
  );
}
